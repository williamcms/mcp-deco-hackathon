import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { useEffect } from "react";

export interface ErrorScreenProps {
  title: string;
  message: string;
  /** Linha extra de orientação (ex: quais campos conferir). */
  hint?: string;
  /** Estado neutro de "cancelado" em vez do estilo destrutivo de erro. */
  cancelled?: boolean;
}

/**
 * Tela de erro/cancelamento compartilhada por todas as tools. Loga o que
 * está sendo exibido para facilitar diagnosticar o que a tool devolveu,
 * sem precisar reproduzir o problema visualmente.
 */
export function ErrorScreen({ title, message, hint, cancelled }: ErrorScreenProps) {
  useEffect(() => {
    console.error(`[ErrorScreen] ${title}`, { message, hint, cancelled });
  }, [title, message, hint, cancelled]);

  return (
    <div className="flex justify-center items-center p-6 min-h-dvh">
      <Card className={cancelled ? "w-full max-w-md" : "w-full max-w-md border-destructive"}>
        <CardHeader>
          <CardTitle className={cancelled ? undefined : "text-destructive"}>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className={cancelled ? "text-sm whitespace-pre-wrap" : "text-sm text-destructive whitespace-pre-wrap"}>
            {message}
          </p>
          {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
