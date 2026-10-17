/**
 * A query's data only once it has succeeded. Reading `query.data` while a Solid Query is pending
 * suspends the nearest <Suspense> (the app-level one) and blanks the whole route; read through this
 * so each view can show its own skeleton instead.
 */
export function loaded<T>(query: {
  readonly isSuccess: boolean;
  readonly data: T | undefined;
}): T | undefined {
  return query.isSuccess ? query.data : undefined;
}
