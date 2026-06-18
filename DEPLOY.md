# Deploy do ambiente de dev/teste

Guia para subir o AgendaBot (api + web + postgres) numa VM Linux via Docker, acessível por `http://IP_DA_VM/` (sem domínio/HTTPS por enquanto).

## 1. Provisionar a VM

Recomendado: **Hetzner Cloud**, plano **CX22** (2 vCPU, 4GB RAM, 40GB disco, ~€4,59/mês) — alternativa: DigitalOcean Droplet com pelo menos 2GB RAM. Sistema: **Ubuntu 24.04 LTS**.

Ao criar a VM, libere a porta **22** (SSH) e **80** (HTTP) no firewall/cloud firewall do provedor.

## 2. Instalar Docker na VM

Conectado via SSH na VM:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# saia e reconecte via SSH para o grupo "docker" valer
```

## 3. Levar o código para a VM

```bash
git clone <url-do-repo> agendabot
cd agendabot
```

## 4. Configurar variáveis de ambiente

```bash
cp .env.example .env
nano .env
```

No mínimo, troque:
- `JWT_SECRET` — gere um valor aleatório forte (ex: `openssl rand -hex 32`)
- `POSTGRES_PASSWORD` — troque a senha padrão

Twilio e Google Calendar podem ficar com os valores de exemplo por enquanto — esses recursos só funcionam com credenciais reais, mas o resto do painel (dashboard, agenda, profissionais, comissões) funciona sem eles.

## 5. Build e subida

```bash
npm run prod:build
npm run prod:up
```

Isso builda as imagens de produção (api e web) e sobe os 3 containers (postgres, api, web). A API roda `prisma migrate deploy` automaticamente ao iniciar.

## 6. Popular dados de teste (opcional)

```bash
docker compose -f docker-compose.prod.yml exec api npx ts-node prisma/seed.ts
```

## 7. Verificar

```bash
curl http://localhost/health   # deve responder via proxy do nginx -> api
```

Acesse `http://IP_DA_VM/` no navegador — deve cair na tela de login. Use o tenant de seed (`barbearia-demo` / `senha123`) se você rodou o passo 6.

## Atualizar após mudanças no código

```bash
git pull
npm run prod:build
npm run prod:up
```

## Logs / troubleshooting

```bash
npm run prod:logs        # logs de todos os serviços
docker compose -f docker-compose.prod.yml ps
```

## Limitações conhecidas deste setup inicial

- Sem domínio/HTTPS — ok para teste interno, mas Twilio/Google OAuth em produção real exigem HTTPS.
- Postgres não está com backup automatizado — para teste tá ok, mas não usar para dados reais de clientes ainda.
