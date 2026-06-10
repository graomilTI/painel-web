# Worker da Central de E-mails

Este worker roda fora do navegador para acessar IMAP/SMTP do cPanel com segurança.

## Instalação no servidor

```bash
cd email-worker
cp .env.example .env
nano .env
npm install
npm run once
```

Para rodar continuamente:

```bash
npm start
```

Ou por cron a cada 3 minutos:

```cron
*/3 * * * * cd /caminho/painel-web-main/email-worker && /usr/bin/npm run once >> email-worker.log 2>&1
```

## O que ele faz

1. Busca contas ativas em `email_accounts`.
2. Lê e-mails novos via IMAP.
3. Salva mensagens e anexos no Supabase.
4. Classifica por regras e, se `OPENAI_API_KEY` existir, melhora a classificação com IA.
5. Envia respostas aprovadas em `email_outbox` via SMTP.

Por segurança, respostas automáticas só são geradas quando a conta permite `auto_responder` e a regra também permite `auto_responder`. O padrão do painel é aprovação manual.
