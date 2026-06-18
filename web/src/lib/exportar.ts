import { api } from "./api";

export async function baixarRelatorio(url: string, nomeArquivo: string): Promise<void> {
  const resp = await api.get(url, { responseType: "blob" });
  const href = URL.createObjectURL(resp.data as Blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(href);
}
