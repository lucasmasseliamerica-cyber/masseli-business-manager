# Staff TEST — renovação da coleta sem encaminhamentos

## Janela de 11 de novembro, 09h50–10h35

A confirmação cobriu 14h50–15h35 UTC, com recuperação reservada a 15h25–15h35. Na admissão, as leituras do TEST confirmaram a fixture, permissões padrão e ausência de locks concorrentes nas relações staff. A Edge v6 manteve ID, bundle, quatro fontes e `verify_jwt=true`. Os timestamps da fixture foram comparados como instantes com precisão de microssegundos. O launcher encerrou com saída 2 no guard dos arquivos vinculados. A parada ocorreu antes do lock da coleta e do formulário. O diário registra zero novos encaminhamentos Auth e zero envios de negócio. [Evidência](./evidence/staff-integrated-admission-blocked-20261111.json)

### Complemento para revisão

Vincular exclusivamente `App.jsx` e `src/App.jsx` do commit QA `870dfae6390d50f6d867ed07c73fe04705563a12`, ambos idênticos e com SHA-256 `5d4a78e51bcb1ac87dc455fe56066e3b12836fcee4d3f5ec6e66c7f3078ce450`. O vínculo original aponta para `aabe235069c70ea2130c7a39aee52ffb2de585d78ba93546df71402855a561b2` em ambos. A diferença vem de `4671591` (Stripe Terminal no PDV) e `d554b2b` (guia de configuração inicial, com atalho para Equipe e Permissões condicionado a `manageUsers`). A alteração da tela de equipe se limita ao título e à âncora do guia. A migração staff e os três outros arquivos de código vinculados conferem pelos hashes originais.

O complemento proposto mantém o manifesto de negócio e o adendo vigentes, os 21 casos fixados, Edge v6, SQL de checkpoint, recuperação e orçamentos. O executor atual conserva o guard original. Após aceite do complemento, vincular o novo par de hashes como condição estrita, testar rejeição de qualquer outro hash e verificar o novo vínculo antes de agendar a próxima coleta. O Preview mantém o commit `d554b2b`. Staff permanece suspenso.

## Estado comprovado

A janela de 10/11/2026, 20:36–21:21 UTC, correspondeu a 15:36–16:21 em Nova York. O processo 19208 registrou parada em `COLLECTION` às 21:10:35.011 UTC, no limite da coleta. Na conferência local de 11/11, o processo havia encerrado e a porta 62477 estava fechada.

O diário canônico conserva o lock, a abertura do formulário e a parada originais. Ausência de artefatos Auth e de comandos/intenções/reservas de negócio, junto do fluxo do código admitido em `fa8c2d1c1417e39957b2bca2e38d2f7e7e30996a`, comprova que a etapa de rede dessa execução permaneceu inacessível. O relatório terminal registra somente a fase. Ele permite distinguir a etapa alcançada, enquanto a causa interna permanece sem código persistido. A coincidência com o limite de coleta é compatível com expiração.

Os 21 casos continuam sem execução. Consumo desse processo foi zero GET administrativo, zero login Auth, zero GET de identidade, zero Edge e zero PATCH. A última admissão TEST, de 10/11 às 20:36:23 UTC, confirmou os dois perfis e employees QA inativos e zero auditorias staff. Esta continuação realizou apenas verificações locais. O estado remoto atual será conferido na próxima admissão.

## Autorizações preservadas

O complemento registrado em 10/11 foi reafirmado com o mesmo saldo. OWNER A possui um GET administrativo pelo UUID fixo e um POST Auth. MANAGER possui o GET anterior e um POST adicional. EMPLOYEE possui o GET e o POST da autorização anterior. A reafirmação acrescentou zero slots. A tentativa manual MANAGER permanece contada como possivelmente consumida, com status HTTP desconhecido.

O manifesto de negócio `de56f442bf76ed402cdc2a83c629bfd7a59205bf43cbd882a807a1c0230bc94f`, o vínculo do adendo `61ca25cce72fac16a224df507e0146667f3fcf1daa584d8d27fe659a16f491cb` e o checkpoint `f4b9aa823e4c33c1efc58af83fd79410b75dce26765ee764f116b81732da47f7` permanecem fixados. O saldo de negócio é 17 Edge e 4 PATCH, incluindo R1–R4.

## Ajuste local

O launcher anterior rejeitava a presença do próprio lock após a coleta encerrada. A renovação preparada exige um recibo exclusivo de encerramento da coleta, hashes dos seis artefatos preservados, PID antigo encerrado, janela posterior e escopo Auth idêntico. A janela, a aprovação e a admissão antigas foram copiadas byte a byte para arquivos históricos exclusivos. Os três originais operacionais atuais ainda conservam os valores da janela expirada.

O recibo `staff-integrated-collection-expired-20261110.json` tem SHA-256 `59f585a107473da45e89087a0b575529998837f62895b00d0b0dae65005e4c9e`. Ele se aplica exclusivamente ao diário staff. O launcher vincula esse recibo ao próximo arquivo de aprovação e ao manifesto de integração revisado. A seleção dos recibos de lock, formulário e parada da renovação é fixa. Os arquivos anteriores permanecem íntegros.

Qualquer artefato Auth, comando, leitura autenticada, intenção, reserva, resultado de negócio, READY, STOP ou CLOSE bloqueia essa admissão. Um lock da renovação também impede outra abertura. O controlador exige o PID da execução corrente e o hash de sua janela. O recibo de parada antigo é preservado durante a espera pelos resultados atuais.

Os módulos de coleta, Auth e negócio mantêm seus hashes anteriores. A mudança envolve o launcher e o controlador. Prazo absoluto, margem de 25 segundos, timeout máximo de 20 segundos por envio, três sessões em memória no mesmo PID e parada após erro ou resultado incerto seguem nos contratos existentes. O marcador C2 permanece preservado.

## Validação afetada

Cinco regressões novas passaram com zero falhas ou skips, usando dados sintéticos e arquivos locais descartáveis. Elas cobrem preservação e escopo, processo ativo e drift, traços de encaminhamento e replay, falha da coleta com persistência exclusiva e seleção de processo/janela/resultado no controlador. Sintaxe dos arquivos alterados e `git diff --check` passaram.

As seis verificações integradas anteriores e as suítes de negócio foram reutilizadas. CI remota permanece pendente de publicação. Os hashes identificam os bytes e dependem da integridade do computador local e do registro da aprovação.

## Sequência operacional pendente

1. Confirmar disponibilidade e uma nova janela exclusiva de até 45 minutos. Reservar os últimos 10 minutos para R1–R4 e conferência. A abertura do formulário depende dessa confirmação.
2. Vincular a nova janela e a aprovação aos arquivos preservados e ao manifesto revisado. Revalidar somente projeto TEST, versão/identidade/fontes Edge aceitas, estado inicial, quiescência e limites atuais. Preservar os contadores de leitura entre as admissões e aproveitar checkpoints frescos quando os guards existentes permitirem.
3. Admitir uma única coleta no mesmo PID de Auth e negócio. Receber a chave existente e as três senhas atuais nos campos locais mascarados. Comprovar as três identidades e validade dos JWTs até o fim da janela mais a margem já exigida.
4. Executar individualmente os casos fixados, com leituras, intenção, reserva e conferência de estado/auditoria. O orçamento restante conserva os alvos e payloads aprovados. Qualquer erro ou incerteza encerra os envios, incluindo recuperação.
5. Conferir os campos restaurados, canários, nove auditorias previstas, estados finais e contadores. Registrar casos bloqueados ou sem execução. Staff permanece suspenso até aceite explícito.

O pacote local revisado está em `outputs/staff-integrated-renewal-20261111`. Seu manifesto tem SHA-256 `597162e42625301656f2ee8dd1c3a9ef4a44c384c2a434960c66320df01fa356`. A cobertura operacional permanece 16/60.
