export interface IsolatedFixtureEnvironmentInput {
  baseURL: string;
  anonKey: string;
}

export interface IsolatedFixtureMessageInput extends IsolatedFixtureEnvironmentInput {
  accessToken: string;
}

/** Confere a identidade do backend isolado, sem navegar ou devolver credenciais. */
export declare function assertIsolatedFixtureEnvironment(
  input: IsolatedFixtureEnvironmentInput,
): Promise<void>;

/** Acrescenta somente a mensagem fixa de preparação e confirma sua leitura pela RLS. */
export declare function insertIsolatedFixtureMessage(
  input: IsolatedFixtureMessageInput,
): Promise<void>;
