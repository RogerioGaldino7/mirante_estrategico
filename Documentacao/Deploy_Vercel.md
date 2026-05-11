# Deploy no Vercel

Este projeto foi preparado para publicar apenas a aplicacao web da pasta
`_Sistema`, sem enviar bases CSV, exportacoes de IA ou documentacao operacional
para a hospedagem.

## Arquivos criados

- `package.json`: define o comando de build.
- `scripts/build-vercel.js`: copia `_Sistema` para `dist`.
- `vercel.json`: configura o Vercel para publicar `dist`.
- `.vercelignore`: impede envio de bases, exportacoes e documentacao.

## Como testar localmente

No Windows, caso o PowerShell bloqueie `npm`, use `npm.cmd`:

```powershell
npm.cmd run build
```

O build deve criar:

```text
dist/index.html
dist/style.css
dist/js/
dist/Imagem/
```

## Como publicar pelo site do Vercel

1. Suba o projeto para um repositorio GitHub, GitLab ou Bitbucket.
2. Acesse o Vercel.
3. Clique em `Add New Project`.
4. Importe o repositorio.
5. Confira as configuracoes:
   - Framework Preset: `Other`
   - Build Command: `npm run build`
   - Output Directory: `dist`
6. Clique em `Deploy`.

## Como publicar pelo Vercel CLI

Se o Vercel CLI estiver instalado e autenticado:

```powershell
vercel
```

Para publicar em producao:

```powershell
vercel --prod
```

Nesta maquina, durante a preparacao, o comando `vercel` nao estava instalado.
Caso queira usar CLI, instale com:

```powershell
npm.cmd install -g vercel
```

Depois:

```powershell
vercel login
vercel
vercel --prod
```

## Cuidados importantes

- Nao publique `_Bases_para_Upload`: pode conter dados reais/sensiveis.
- Nao publique `Exportacoes_IA`: pode conter JSONs analiticos sensiveis.
- O dashboard continua client-side: os dados CSV sao carregados pelo usuario no
  navegador e nao ficam gravados no Vercel.
- O modo `?dev=1` em `loader.js` aponta para caminhos locais antigos e nao deve
  ser usado em producao.

