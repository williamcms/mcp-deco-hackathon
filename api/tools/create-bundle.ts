import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import {
  buildBundlePlan,
  type ComponentRequest,
  defaultBundleTitle,
  type PricingStrategy,
} from "../analysis/bundle-plan.ts";
import {
  adminProductUrl,
  createProductBundle,
  fetchComponentProducts,
  pollBundleOperation,
  toProductGid,
  updateBundlePrice,
  updateBundleProduct,
  uploadProductImage,
} from "../shopify/bundles.ts";
import { resolveCredentials } from "../shopify/client.ts";
import type { Env } from "../types/env.ts";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const componentInputSchema = z.object({
  productId: z
    .string()
    .describe(
      "Produto componente. Aceita o gid (gid://shopify/Product/123), o ID numérico ou a URL do produto no admin.",
    ),
  quantity: z.number().int().min(1).max(2000).optional().describe("Unidades deste produto dentro do kit. Padrão: 1."),
  options: z
    .array(
      z.object({
        name: z.string().describe("Nome da opção no produto, ex: Tamanho."),
        values: z.array(z.string()).min(1).describe('Valores oferecidos no kit, ex: ["M", "G"].'),
      }),
    )
    .optional()
    .describe(
      "Quais valores de cada opção entram no kit. Sem isso, é usado o primeiro valor de cada opção do produto.",
    ),
});

export const createBundleInputSchema = z.object({
  components: z
    .array(componentInputSchema)
    .optional()
    .describe(
      "Obrigatório. Array com no mínimo 2 e no máximo 10 produtos que formam o kit, normalmente os de uma combinação devolvida por discover_combinations. Não chame esta tool sem antes ter os IDs concretos dos produtos — rode discover_combinations ou uma busca de produtos primeiro.",
    ),
  title: z
    .string()
    .min(1)
    .max(255)
    .optional()
    .describe('Título do produto do kit. Padrão: "Kit A + B" com os títulos dos componentes.'),
  discountPercentage: z
    .number()
    .min(0)
    .max(90)
    .optional()
    .describe("Desconto sobre a soma dos componentes, em %. Ignorado se fixedPrice for informado."),
  fixedPrice: z
    .number()
    .min(0)
    .optional()
    .describe("Preço final do kit, na moeda da loja. Tem precedência sobre discountPercentage."),
  status: z
    .enum(["DRAFT", "ACTIVE"])
    .optional()
    .describe("Status do produto criado. Padrão: DRAFT — o kit nasce fechado para revisão antes de ir ao ar."),
  tags: z.array(z.string()).max(20).optional().describe('Tags do produto do kit. Padrão: ["bundle"].'),
  descriptionHtml: z.string().max(10000).optional().describe("Descrição do kit em HTML, exibida na página do produto."),
  seoTitle: z
    .string()
    .max(70)
    .optional()
    .describe(
      "Título da página nos resultados de busca. Sem isso, o Google usa o título do produto. O corte na SERP fica em torno de 60 caracteres.",
    ),
  seoDescription: z
    .string()
    .max(320)
    .optional()
    .describe(
      "Meta description exibida abaixo do título na busca. Sem isso, o Google monta o trecho sozinho a partir da página. O corte fica em torno de 160 caracteres.",
    ),
  handle: z
    .string()
    .max(255)
    .optional()
    .describe(
      "Slug da URL do produto, ex: kit-cafe-da-manha. Sem isso a Shopify deriva do título. Slug já usado não é recusado: ela sufixa em silêncio (kit-cafe-2).",
    ),
  imageAlt: z
    .string()
    .max(512)
    .optional()
    .describe("Texto alternativo da imagem do kit — o que leitor de tela anuncia e o que busca de imagem indexa."),
  dryRun: z
    .boolean()
    .optional()
    .describe(
      "Padrão: true. Em true apenas simula — calcula preço, margem, estoque e cenários sem tocar na loja. Passe false para criar o bundle de fato.",
    ),
  maxPollAttempts: z
    .number()
    .int()
    .min(1)
    .max(60)
    .optional()
    .describe("Tentativas de leitura do status da criação, uma por segundo. Padrão: 20."),
});

export type CreateBundleInput = z.input<typeof createBundleInputSchema>;

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const plannedComponentSchema = z.object({
  productId: z.string(),
  title: z.string(),
  handle: z.string(),
  status: z.string(),
  imageUrl: z.string().nullable(),
  quantity: z.number(),
  variantId: z.string(),
  variantTitle: z.string().nullable(),
  optionSelections: z.array(z.object({ name: z.string(), values: z.array(z.string()) })),
  availableOptions: z
    .array(z.object({ name: z.string(), values: z.array(z.string()) }))
    .describe("Todos os valores que cada opção oferece, não só o escolhido — para montar um seletor de variante"),
  unitPrice: z.number(),
  unitCost: z.number().nullable(),
  lineTotal: z.number(),
  inventoryQuantity: z.number().nullable(),
  maxBundles: z.number().nullable(),
});

export const createBundleOutputSchema = z.object({
  mode: z.enum(["simulation", "created"]).describe("simulation = nada foi escrito na loja; created = bundle existe"),
  shop: z.string(),
  title: z.string(),
  pricing: z.object({
    strategy: z.enum(["sum", "discount_percentage", "fixed_price"]),
    currency: z.string(),
    componentsTotal: z.number().describe("Soma dos componentes, sem desconto"),
    bundlePrice: z.number().describe("Preço do kit"),
    savings: z.number().describe("Quanto o cliente economiza"),
    discountPct: z.number(),
    costTotal: z.number().nullable(),
    marginPerBundle: z.number().nullable(),
    marginPct: z.number().nullable(),
    marginCoverage: z.number().describe("% da receita do kit com custo cadastrado"),
  }),
  components: z.array(plannedComponentSchema),
  inventory: z.object({
    level: z.enum(["high", "medium", "low", "unknown"]),
    maxBundles: z.number().nullable().describe("Kits que o estoque sustenta"),
    bottleneckId: z.string().nullable(),
    bottleneckTitle: z.string().nullable(),
    bottleneckStock: z.number().nullable(),
  }),
  scenarios: z
    .array(
      z.object({
        label: z.string(),
        discountPct: z.number(),
        bundlePrice: z.number(),
        savings: z.number(),
        marginPerBundle: z.number().nullable(),
        marginPct: z.number().nullable(),
        selected: z.boolean(),
      }),
    )
    .describe("Comparação de descontos contra margem, para decidir o preço"),
  bundle: z
    .object({
      productId: z.string(),
      title: z.string(),
      handle: z.string(),
      status: z.string(),
      adminUrl: z.string(),
      onlineStoreUrl: z.string().nullable(),
      variantsPriced: z.number(),
      operationId: z.string(),
      operationStatus: z.string(),
      imageUrl: z.string().nullable().optional(),
    })
    .nullable()
    .describe("Preenchido só quando dryRun = false e a criação concluiu"),
  warnings: z.array(z.string()),
  nextStep: z.string().describe("O que fazer a seguir, em uma frase"),
});

export type CreateBundleOutput = z.infer<typeof createBundleOutputSchema>;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export const createBundleTool = (env: Env) =>
  createTool({
    id: "create_bundle",
    description:
      'Ação interna, sem UI própria: transforma uma combinação em um bundle de verdade na Shopify (productBundleCreate), com estoque derivado dos componentes. Por padrão apenas SIMULA (dryRun = true): devolve preço do kit, economia, margem, cenários de desconto e quantos kits o estoque sustenta, sem escrever nada. Chame de novo com dryRun = false para criar o produto, aplicar o preço e definir o status. Acionada pela ação "Montar bundle" na tela de discover_combinations — não chame diretamente pelo chat sem antes ter os produtos de uma combinação em mãos. Precisa dos escopos write_products, read_products e read_inventory, e de uma loja com o recurso de bundles habilitado. Bundles criados aparecem na aba "Bundles" de discover_combinations.',
    inputSchema: createBundleInputSchema,
    outputSchema: createBundleOutputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async ({ context }) => {
      const dryRun = context.dryRun ?? true;
      const status = context.status ?? "DRAFT";
      const tags = context.tags ?? ["bundle"];
      const maxPollAttempts = context.maxPollAttempts ?? 20;

      const components = context.components ?? [];
      if (components.length < 2 || components.length > 10) {
        throw new Error(
          `"components" precisa ter entre 2 e 10 produtos (recebido: ${components.length}). Rode discover_combinations primeiro, escolha uma combinação, e chame create_bundle com os IDs dos produtos dela.`,
        );
      }

      const credentials = resolveCredentials(env);

      const requests: ComponentRequest[] = components.map((component) => ({
        productId: toProductGid(component.productId),
        quantity: component.quantity ?? 1,
        options: component.options,
      }));

      const duplicated = findDuplicate(requests.map((r) => r.productId));
      if (duplicated) {
        throw new Error(
          `O produto ${duplicated} aparece duas vezes nos componentes. Use quantity para repetir o mesmo item dentro do kit.`,
        );
      }

      const { shop, byId } = await fetchComponentProducts(
        credentials,
        requests.map((request) => request.productId),
      );

      const strategy: PricingStrategy =
        context.fixedPrice != null ? "fixed_price" : context.discountPercentage != null ? "discount_percentage" : "sum";

      const plan = buildBundlePlan(
        requests,
        byId,
        {
          strategy,
          value: context.fixedPrice ?? context.discountPercentage ?? null,
        },
        shop.currencyCode,
      );

      const title = context.title ?? defaultBundleTitle(plan.components);
      const warnings = [...plan.warnings];

      if (plan.inventory.level === "low") {
        warnings.push(
          `O estoque atual monta ${plan.inventory.maxBundles} ${plan.inventory.maxBundles === 1 ? "kit" : "kits"}, limitado por "${plan.inventory.bottleneckTitle}". Reponha antes de divulgar.`,
        );
      }

      if (dryRun) {
        return {
          mode: "simulation" as const,
          shop: shop.name,
          title,
          pricing: plan.pricing,
          components: plan.components,
          inventory: plan.inventory,
          scenarios: plan.scenarios,
          bundle: null,
          warnings,
          nextStep:
            "Revise preço, margem e estoque. Para criar o bundle na Shopify, chame create_bundle de novo com os mesmos argumentos e dryRun = false.",
        };
      }

      // -----------------------------------------------------------------
      // Escrita na loja
      // -----------------------------------------------------------------

      const operation = await createProductBundle(credentials, title, plan.mutationComponents);

      const { operation: finished } = await pollBundleOperation(credentials, operation.operationId, maxPollAttempts);

      const product = finished?.product;

      if (!product) {
        warnings.push(
          `A criação foi aceita (operação ${operation.operationId}) mas ainda estava em ${finished?.status ?? operation.status} depois de ${maxPollAttempts}s. O preço e o status não foram aplicados. Verifique o produto no admin em instantes.`,
        );

        return {
          mode: "created" as const,
          shop: shop.name,
          title,
          pricing: plan.pricing,
          components: plan.components,
          inventory: plan.inventory,
          scenarios: plan.scenarios,
          bundle: null,
          warnings,
          nextStep:
            "A Shopify ainda está montando o bundle. Abra o admin para conferir o produto e aplique o preço manualmente se ele não tiver entrado.",
        };
      }

      // O preço é aplicado sempre, inclusive sem desconto: quem define o
      // valor do bundle é o produto pai, e ele não nasce com a soma dos
      // componentes. Sem este passo o kit iria ao ar com o preço errado.
      //
      // E vem antes do status de propósito: ativar primeiro exporia o kit
      // com o preço que a Shopify criou, não com o que foi aprovado.
      const variants = product.variants.nodes.map((variant) => ({
        id: variant.id,
        price: plan.pricing.bundlePrice.toFixed(2),
        compareAtPrice: plan.pricing.savings > 0 ? plan.pricing.componentsTotal.toFixed(2) : null,
      }));

      const priced = await updateBundlePrice(credentials, product.id, variants);
      const variantsPriced = priced.length;

      if (product.variants.nodes.length > 1) {
        warnings.push(
          `O kit ficou com ${product.variants.nodes.length} variantes e todas receberam o mesmo preço (${plan.pricing.bundlePrice}). Ajuste no admin se alguma combinação valer outro valor.`,
        );
      }

      const seo = {
        ...(context.seoTitle ? { title: context.seoTitle } : {}),
        ...(context.seoDescription ? { description: context.seoDescription } : {}),
      };

      const updated = await updateBundleProduct(credentials, product.id, {
        status,
        tags,
        ...(context.descriptionHtml ? { descriptionHtml: context.descriptionHtml } : {}),
        ...(Object.keys(seo).length > 0 ? { seo } : {}),
        ...(context.handle ? { handle: context.handle } : {}),
      });

      // A Shopify sufixa slug repetido em vez de recusar, então o handle
      // pedido e o aplicado podem divergir sem nenhum erro.
      if (context.handle && updated.handle !== context.handle) {
        warnings.push(
          `A URL pedida ("${context.handle}") já estava em uso e a Shopify aplicou "${updated.handle}". Mude o handle se essa URL não servir.`,
        );
      }

      let generatedImageUrl: string | null = null;
      const apiKey = process.env["GEMINI_API_KEY"];
      if (!apiKey) {
        warnings.push(
          "Imagem promocional não gerada: variável de ambiente GEMINI_API_KEY não configurada.",
        );
      } else {
        try {
          const ai = new GoogleGenAI({ apiKey });
          const prompt = `Uma imagem promocional realista e de alta qualidade de um kit de produtos (bundle) contendo: ${components.map((c) => plan.components.find(pc => pc.productId === c.productId)?.title || "Produto").join(", ")}. Fundo neutro de estúdio, iluminação profissional. Utilize as imagens de referência dos produtos fornecidas para compor o kit.`;

          const inputContent: unknown[] = [];
          for (const c of plan.components) {
              if (c.imageUrl) {
                  try {
                      const res = await fetch(c.imageUrl);
                      if (res.ok) {
                          const buffer = await res.arrayBuffer();
                          const base64 = Buffer.from(buffer).toString("base64");
                          const mimeType = res.headers.get("content-type") || "image/jpeg";
                          inputContent.push({
                              type: "image",
                              data: base64,
                              mime_type: mimeType,
                          });
                      }
                  } catch (e) {
                      console.error("Erro ao buscar imagem de referência", e);
                  }
              }
          }
          inputContent.push({ type: "text", text: prompt });

          const interaction = await (ai.interactions as any).create({
              model: "gemini-3.1-flash-image",
              input: inputContent,
              generation_config: {
                  max_output_tokens: 65536,
                  thinking_level: "minimal",
                  image_config: {
                      aspect_ratio: "1:1",
                      image_size: "1K",
                  },
              },
              response_modalities: ["image"],
          });

          if (interaction.steps) {
              for (const step of interaction.steps) {
                  if (step.type === "model_output" && step.content) {
                      for (const part of step.content) {
                          if (part.type === "image" && part.data) {
                              const uploadedImage = await uploadProductImage(
                                credentials,
                                updated.id,
                                part.data,
                                context.imageAlt,
                              );
                              generatedImageUrl = uploadedImage.src;
                          }
                      }
                  }
              }
          }
        } catch (err) {
          warnings.push(`Não foi possível gerar a imagem promocional com Nano Banana: ${err instanceof Error ? err.message : "Erro desconhecido"}`);
        }
      }

      if (status === "ACTIVE") {
        warnings.push(
          "O produto foi ativado, mas ativar não publica: confirme os canais de venda do kit no admin antes de divulgar.",
        );
      }

      return {
        mode: "created" as const,
        shop: shop.name,
        title: updated.title,
        pricing: plan.pricing,
        components: plan.components,
        inventory: plan.inventory,
        scenarios: plan.scenarios,
        bundle: {
          productId: updated.id,
          title: updated.title,
          handle: updated.handle,
          status: updated.status,
          adminUrl: adminProductUrl(credentials.shopDomain, updated.id),
          onlineStoreUrl: updated.onlineStoreUrl,
          variantsPriced,
          operationId: operation.operationId,
          operationStatus: finished?.status ?? operation.status,
          imageUrl: generatedImageUrl,
        },
        warnings,
        nextStep:
          status === "DRAFT"
            ? "O kit está como rascunho. Revise no admin e mude para ativo quando quiser publicar."
            : "O kit está ativo. Confira os canais de venda e acompanhe conversão e ruptura de estoque.",
      };
    },
  });

function findDuplicate(ids: string[]): string | null {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return null;
}
