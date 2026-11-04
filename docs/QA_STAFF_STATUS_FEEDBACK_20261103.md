# Equipe — falha visível ao desativar/reativar login

Lacuna independente de interface: UserFormModal.deactivate aguardava setUsers sem catch,
deixando rejeição sem tratamento. Reprodução com o handler real extraído do JSX e callback
sintético rejeitado: teste falhou por rejeição inesperada. Nenhum usuário real foi alterado.

Correção localizada: reutilizar error/submitting já existentes; capturar rejeição, fechar a
confirmação e manter o formulário com erro visível; não emitir toast de sucesso ou fechar o
formulário em falha. finally libera o estado de envio. Mensagem fallback traduzida PT/EN,
região de erro role=alert e ação desativar bloqueada durante envio. ConfirmDialog continua
com seu bloqueio busy existente, sem alteração global do componente.

Guardas de perfil próprio e último OWNER precedem o envio. Resultado incerto conserva a
mensagem de reconciliação do chamador; não há retry dentro do handler. Sucesso confirmado
continua alterando somente active e fechando o modal. Nenhuma regra OWNER-safe foi removida.

Sete regressões novas do handler/feedback e nove testes de employee afetados: **16/16 PASS**,
zero falhas/skips. Build Vite PASS, 1.579 módulos. Fonte App/src sincronizada. Testes de
estado/callback sintéticos, sem navegador/sessão/usuário real. CI isolada staff-ui-feedback
Linux/Windows executa esses 16 e build; não repete staff 76, financeiro 50 ou calendário.

Preparado/testado isoladamente; aplicação/homologação real dependem da entrega staff e dos
gates já documentados. Sem nova fixture, convite, usuário, permissão, conexão TEST ou C2.
Cobertura operacional permanece 16/60.
