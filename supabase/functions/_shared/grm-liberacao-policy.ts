export function shouldClearOperationalRules(
  cpf: string,
  cpfsAuthorizedInActiveWindow: ReadonlySet<string>,
): boolean {
  return cpf.length === 11 && !cpfsAuthorizedInActiveWindow.has(cpf);
}

export function isDesiredStateApplied(
  action: 'APLICAR' | 'LIMPAR',
  desiredHash: string,
  appliedHash: unknown,
  applicationStatus: unknown,
): boolean {
  const expectedStatus = action === 'APLICAR' ? 'APLICADO' : 'LIMPO';
  return appliedHash === desiredHash && applicationStatus === expectedStatus;
}
