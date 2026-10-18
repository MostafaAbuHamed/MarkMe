export async function fault(): Promise<void> {
  Promise.resolve(1);
}
