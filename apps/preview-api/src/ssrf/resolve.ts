export type ResolvedAddress = { address: string; family: 4 | 6 };

export type Resolver = (host: string) => Promise<ResolvedAddress[]>;
