import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <main
      id="main"
      className="container entry-loading"
      aria-busy="true"
      aria-label="Carregando página"
    >
      <span className="sr-only" role="status">
        Carregando…
      </span>
      <Skeleton className="entry-loading-title" />
      {[0, 1, 2].map((index) => (
        <div className="entry-loading-card" key={index}>
          <Skeleton className="entry-loading-line" />
          <Skeleton className="entry-loading-line" />
          <Skeleton className="entry-loading-line" />
        </div>
      ))}
    </main>
  );
}
