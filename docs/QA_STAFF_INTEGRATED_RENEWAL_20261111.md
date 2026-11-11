# Staff TEST — renovação da coleta sem encaminhamentos

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
