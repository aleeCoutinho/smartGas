# Safe Gas — frontend

Dashboard estático em HTML, CSS e JavaScript puro. Esta pasta é independente e pode ser movida integralmente para outro repositório.

## Executar

Com o backend rodando em `http://localhost:3000`, execute dentro desta pasta:

```bash
python3 -m http.server 5173
```

Abra:

```text
http://localhost:5173
```

Não abra `index.html` diretamente com `file://`, pois o navegador bloqueará chamadas HTTP por CORS.

## Configuração

Edite `config.js` se o backend estiver em outro endereço:

```js
window.SAFE_GAS_CONFIG = Object.freeze({
  API_BASE_URL: "http://localhost:3000",
  REFRESH_INTERVAL_MS: 30000,
});
```

Se mudar a porta ou o endereço desta página, ajuste também `CORS_ORIGIN` no `.env` do backend.

## Recursos

- Estado do ESP1, ESP2, válvula e MQ-2.
- Peso total, gás restante e porcentagem.
- Abertura e fechamento remoto com regras de segurança.
- Alerta e reconhecimento de vazamentos.
- Consumo diário, semanal e mensal.
- Histórico da balança, vazamentos e comandos.
- Configuração de tara, capacidade e tolerâncias.
- Atualização por Socket.IO com fallback a cada 30 segundos.

O frontend não acessa Supabase ou MQTT diretamente. Todas as operações passam pela API do backend.
