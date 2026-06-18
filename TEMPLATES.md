# Templates WhatsApp — Guia de Criação

Os templates abaixo são usados para mensagens **fora da janela de sessão de 24h** (ou seja, o servidor inicia a conversa, não o cliente). Eles precisam ser criados manualmente no **Twilio Content Template Builder** e aprovados pela Meta antes de poderem ser usados em produção.

## Por que isso é necessário

Quando seu sistema envia uma mensagem proativamente (ex: lembrete de agendamento), o WhatsApp exige que a mensagem use um template pré-aprovado. Mensagens interativas livres (botões, listas) só são permitidas quando o cliente enviou uma mensagem nas últimas 24h.

---

## Como criar um template

1. Acesse o [Twilio Content Template Builder](https://console.twilio.com/us1/develop/sms/content-template-builder)
2. Clique em **"Create new content template"**
3. Selecione o canal **WhatsApp**
4. Escolha o tipo (Quick Reply ou Free Text)
5. Preencha o conteúdo conforme cada template abaixo
6. Envie para aprovação (processo leva 1-3 dias úteis)
7. Após aprovação, copie o **Content SID** (começa com `HX...`)
8. No painel do AgendaBot → **Configurações → Mensagens** → cole o Content SID no template correspondente

---

## Templates necessários

### 1. `lembrete_24h` — Lembrete de agendamento

**Tipo:** Quick Reply  
**Chave interna:** `lembrete_24h`

**Corpo da mensagem:**
```
Olá, {{1}}! 👋
Lembrando do seu agendamento amanhã:
📅 {{2}} às {{3}}
✂️ {{4}} com {{5}}

Toque em Confirmar para confirmar ou Cancelar para cancelar.
```

**Variáveis:**
| Número | Descrição | Exemplo |
|--------|-----------|---------|
| `{{1}}` | Nome do cliente | João Silva |
| `{{2}}` | Data do agendamento | 18/06/2026 |
| `{{3}}` | Horário | 14:00 |
| `{{4}}` | Serviço | Corte de cabelo |
| `{{5}}` | Nome do barbeiro | Carlos |

**Botões:**
- Botão 1: `Confirmar` → payload: `lembrete:confirmar`
- Botão 2: `Cancelar` → payload: `lembrete:cancelar`

---

### 2. `vaga_fila_espera` — Vaga disponível na fila de espera

**Tipo:** Free Text (apenas texto, sem botões — o cliente precisa iniciar um novo agendamento)  
**Chave interna:** `vaga_fila_espera`

**Corpo da mensagem:**
```
🎉 Boa notícia, {{1}}!

Abriu um horário disponível em *{{2}}* com *{{3}}* para *{{4}}*.

Responda esta mensagem para iniciar um novo agendamento e garantir esse horário.
```

**Variáveis:**
| Número | Descrição | Exemplo |
|--------|-----------|---------|
| `{{1}}` | Nome do cliente | João Silva |
| `{{2}}` | Data | 18/06/2026 |
| `{{3}}` | Nome do barbeiro | Carlos |
| `{{4}}` | Serviço | Corte de cabelo |

---

## Comportamento quando não há template aprovado

- **Lembrete:** O sistema tentará enviar como mensagem de texto simples. No sandbox do Twilio isso funciona; em produção pode falhar. Um aviso é registrado no log.
- **Vaga na fila:** Idem — tenta texto simples com fallback logado.

## Sandbox vs. Produção

No **Twilio Sandbox**, os templates não precisam de aprovação da Meta para funcionar — você pode testar com qualquer Content SID. A aprovação é necessária apenas quando você migrar para um número WhatsApp Business real.
