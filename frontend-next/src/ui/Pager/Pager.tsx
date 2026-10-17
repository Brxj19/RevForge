import { Button } from "../Button";
import styles from "./Pager.module.css";

export interface PagerProps {
  /** 1-based index of the first row on this page. */
  from: number;
  to: number;
  /** Total when known; cursor-paginated lists may omit it. */
  total?: number;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  /** Noun for the screen-reader label: "repositories". */
  label?: string;
}

export function Pager(props: PagerProps) {
  const range = () =>
    props.to < props.from
      ? "No results"
      : `${props.from}–${props.to}${props.total === undefined ? "" : ` of ${props.total}`}`;
  return (
    <nav
      class={styles.pager}
      aria-label={props.label ? `${props.label} pages` : "Pagination"}
    >
      <span aria-live="polite">{range()}</span>
      <span class={styles.buttons}>
        <Button
          size="sm"
          disabled={!props.hasPrevious}
          onClick={() => props.onPrevious?.()}
        >
          Previous
        </Button>
        <Button
          size="sm"
          disabled={!props.hasNext}
          onClick={() => props.onNext?.()}
        >
          Next
        </Button>
      </span>
    </nav>
  );
}
