import { fileIconSvg, folderIconSvg } from "./file-icons";
import styles from "./FileIcon.module.css";

export interface FileIconProps {
  /** File name (not path). Used only to look up the icon. */
  name: string;
  size?: number;
  class?: string;
}

export function FileIcon(props: FileIconProps) {
  return (
    <svg
      class={props.class ?? styles.fi}
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 16 16"
      aria-hidden="true"
      innerHTML={fileIconSvg(props.name)}
    />
  );
}

export interface FolderIconProps extends FileIconProps {
  open?: boolean;
}

export function FolderIcon(props: FolderIconProps) {
  return (
    <svg
      class={props.class ?? styles.fi}
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 16 16"
      aria-hidden="true"
      innerHTML={folderIconSvg(props.name, props.open)}
    />
  );
}
