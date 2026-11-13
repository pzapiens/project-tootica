import { Children, isValidElement, type CSSProperties, type ReactNode } from "react";

/** Headers share horizontal scrolling; only the rows scroll vertically. */
export default function TableViewport({
  label, minWidth = "64rem", className = "", bodyClassName = "", children,
}: {
  label: string;
  minWidth?: CSSProperties["minWidth"];
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const content = Children.toArray(children);
  const first = content[0];
  const hasHeader = isValidElement<{ className?: string }>(first)
    && first.props.className?.split(/\s+/).includes("app-table-header");

  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={`app-data-table flex min-h-0 min-w-0 flex-col overflow-x-auto overflow-y-hidden overscroll-x-contain focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${className}`}
    >
      <div className="app-table-frame" style={{ minWidth }}>
        {hasHeader && <div className="app-table-heading">{first}</div>}
        <div role="region" aria-label={`${label} rows`} tabIndex={0} className={`app-table-body ${bodyClassName}`}>
          {hasHeader ? content.slice(1) : children}
        </div>
      </div>
    </div>
  );
}
