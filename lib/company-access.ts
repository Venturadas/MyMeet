// Navigation only; database authorization remains mandatory for every operation.
export function companyAccessRedirect(activeSubscription: boolean, tab: string) {
  return !activeSubscription && tab !== "agenda" ? "/empresa?tab=agenda" : null;
}
