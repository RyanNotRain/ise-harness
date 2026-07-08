declare module 'sql.js' {
  interface SqlJsStatic {
    Database: new () => Database;
  }

  interface Database {
    run(sql: string, params?: unknown[]): void;
    exec(sql: string): unknown[];
    prepare(sql: string): Statement;
    close(): void;
    export(): Uint8Array;
  }

  interface Statement {
    bind(params?: unknown[]): boolean;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): boolean;
  }

  function initSqlJs(config?: Record<string, unknown>): Promise<SqlJsStatic>;
  export { Database, Statement, SqlJsStatic };
  export default initSqlJs;
}