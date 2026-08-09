import { describe, expect, test } from "bun:test";
import { mergeComplementaryProducts } from "./cross-sell.ts";

describe("mergeComplementaryProducts", () => {
	test("merge soma candidatos novos aos já existentes, sem duplicar", () => {
		const result = mergeComplementaryProducts(["a", "b"], ["b", "c"], "merge");

		expect(result.finalIds).toEqual(["a", "b", "c"]);
		expect(result.addedIds).toEqual(["c"]);
		expect(result.alreadyPresentIds).toEqual(["b"]);
	});

	test("merge com lista existente vazia adiciona todos os candidatos", () => {
		const result = mergeComplementaryProducts([], ["a", "b"], "merge");

		expect(result.finalIds).toEqual(["a", "b"]);
		expect(result.addedIds).toEqual(["a", "b"]);
		expect(result.alreadyPresentIds).toEqual([]);
	});

	test("merge não duplica candidato repetido no próprio input", () => {
		const result = mergeComplementaryProducts(["a"], ["b", "b", "c"], "merge");

		expect(result.finalIds).toEqual(["a", "b", "c"]);
		expect(result.addedIds).toEqual(["b", "c"]);
	});

	test("merge onde todos os candidatos já existem não adiciona nada novo", () => {
		const result = mergeComplementaryProducts(["a", "b"], ["a", "b"], "merge");

		expect(result.finalIds).toEqual(["a", "b"]);
		expect(result.addedIds).toEqual([]);
		expect(result.alreadyPresentIds).toEqual(["a", "b"]);
	});

	test("replace substitui a lista inteira, ignorando o que já existia", () => {
		const result = mergeComplementaryProducts(["a", "b"], ["c", "d"], "replace");

		expect(result.finalIds).toEqual(["c", "d"]);
		expect(result.addedIds).toEqual(["c", "d"]);
		expect(result.alreadyPresentIds).toEqual([]);
	});

	test("replace também dedupe os candidatos", () => {
		const result = mergeComplementaryProducts(["a"], ["c", "c"], "replace");

		expect(result.finalIds).toEqual(["c"]);
	});

	test("preserva a ordem: existentes primeiro, depois os novos na ordem em que vieram", () => {
		const result = mergeComplementaryProducts(["x", "y"], ["z", "y", "w"], "merge");

		expect(result.finalIds).toEqual(["x", "y", "z", "w"]);
	});
});
