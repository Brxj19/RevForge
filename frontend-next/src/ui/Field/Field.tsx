import {
  createContext,
  createUniqueId,
  Show,
  splitProps,
  useContext,
  type JSX,
} from "solid-js";
import styles from "./Field.module.css";

interface FieldContextValue {
  id: string;
  describedBy: () => string | undefined;
  invalid: () => boolean;
}

const FieldContext = createContext<FieldContextValue>();

/** Inputs inside a Field pick up its id, aria-describedby and aria-invalid automatically. */
export function useField() {
  return useContext(FieldContext);
}

export interface FieldProps {
  label: JSX.Element;
  hint?: JSX.Element;
  /** Error text replaces the hint and marks the control invalid. */
  error?: JSX.Element;
  optional?: boolean;
  /** Explicit id for the control; generated otherwise. */
  id?: string;
  /** Use "group" for radio/checkbox sets so the label becomes a legend-like heading. */
  kind?: "control" | "group";
  children: JSX.Element;
  class?: string;
}

export function Field(props: FieldProps) {
  const generated = createUniqueId();
  // Ids are fixed for the life of the field; reading props.id once is intentional.
  // eslint-disable-next-line solid/reactivity
  const id = props.id ?? `f-${generated}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const ctx: FieldContextValue = {
    id,
    describedBy: () =>
      props.error ? errorId : props.hint ? hintId : undefined,
    invalid: () => Boolean(props.error),
  };
  return (
    <FieldContext.Provider value={ctx}>
      <div
        class={props.class ? `${styles.field} ${props.class}` : styles.field}
        role={props.kind === "group" ? "group" : undefined}
        aria-labelledby={props.kind === "group" ? `${id}-label` : undefined}
      >
        <Show
          when={props.kind === "group"}
          fallback={
            <label class={styles.label} for={id} id={`${id}-label`}>
              {props.label}
              <Show when={props.optional}>
                <span class={styles.optional}> (optional)</span>
              </Show>
            </label>
          }
        >
          <span class={styles.label} id={`${id}-label`}>
            {props.label}
          </span>
        </Show>
        {props.children}
        <Show
          when={props.error}
          fallback={
            <Show when={props.hint}>
              <span class={styles.hint} id={hintId}>
                {props.hint}
              </span>
            </Show>
          }
        >
          <span class={styles.error} id={errorId} role="alert">
            {props.error}
          </span>
        </Show>
      </div>
    </FieldContext.Provider>
  );
}

export interface InputProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  mono?: boolean;
}

export function Input(props: InputProps) {
  const field = useField();
  const [local, rest] = splitProps(props, ["invalid", "mono", "class"]);
  const invalid = () => local.invalid ?? field?.invalid() ?? false;
  return (
    <input
      id={field?.id}
      aria-describedby={field?.describedBy()}
      {...rest}
      class={local.class ? `${styles.input} ${local.class}` : styles.input}
      aria-invalid={invalid() || undefined}
      data-mono={local.mono || undefined}
    />
  );
}

export interface TextareaProps extends JSX.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  mono?: boolean;
}

export function Textarea(props: TextareaProps) {
  const field = useField();
  const [local, rest] = splitProps(props, ["invalid", "mono", "class"]);
  const invalid = () => local.invalid ?? field?.invalid() ?? false;
  return (
    <textarea
      id={field?.id}
      aria-describedby={field?.describedBy()}
      rows={3}
      {...rest}
      class={
        local.class
          ? `${styles.input} ${styles.textarea} ${local.class}`
          : `${styles.input} ${styles.textarea}`
      }
      aria-invalid={invalid() || undefined}
      data-mono={local.mono || undefined}
    />
  );
}

export interface InputGroupProps extends Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  "prefix"
> {
  /** Leading content: icon or fixed prefix such as "sigma/". */
  prefix?: JSX.Element;
  /** Trailing content: kbd hint, clear button, unit. */
  suffix?: JSX.Element;
  invalid?: boolean;
  /** Extra class for the wrapper. */
  wrapClass?: string;
}

/** Input with prefix/suffix inside one bordered box (prototype .input-wrap). */
export function InputGroup(props: InputGroupProps) {
  const field = useField();
  const [local, rest] = splitProps(props, [
    "prefix",
    "suffix",
    "invalid",
    "wrapClass",
    "class",
  ]);
  const invalid = () => local.invalid ?? field?.invalid() ?? false;
  return (
    <div
      class={
        local.wrapClass ? `${styles.wrap} ${local.wrapClass}` : styles.wrap
      }
      data-invalid={invalid() || undefined}
    >
      <Show when={local.prefix}>
        <span class={styles.affix}>{local.prefix}</span>
      </Show>
      <input
        id={field?.id}
        aria-describedby={field?.describedBy()}
        {...rest}
        class={local.class}
        aria-invalid={invalid() || undefined}
      />
      <Show when={local.suffix}>
        <span class={styles.affix}>{local.suffix}</span>
      </Show>
    </div>
  );
}
