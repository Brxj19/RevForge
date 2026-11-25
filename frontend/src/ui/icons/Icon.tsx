import { splitProps, type JSX } from "solid-js";
import { ICON_PATHS, type IconName } from "./icon-paths";

export type { IconName };

export interface IconProps extends JSX.SvgSVGAttributes<SVGSVGElement> {
  name: IconName;
  size?: number;
}

/** Stroke icon from the static ICON_PATHS map. Decorative: label the control, not the icon. */
export function Icon(props: IconProps) {
  const [local, rest] = splitProps(props, ["name", "size"]);
  return (
    <svg
      width={local.size ?? 16}
      height={local.size ?? 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      data-icon={local.name}
      {...rest}
      innerHTML={ICON_PATHS[local.name]}
    />
  );
}
