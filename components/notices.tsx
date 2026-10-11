export function Notices({
  params,
}: {
  params: { notice?: string; error?: string };
}) {
  return (
    <>
      {params.notice && (
        <p className="notice" role="status">
          {params.notice}
        </p>
      )}
      {params.error && (
        <p className="notice error" role="alert">
          {params.error}
        </p>
      )}
    </>
  );
}
