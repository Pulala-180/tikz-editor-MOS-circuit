import type { ReactNode } from "react";
import {
  RiAlignItemHorizontalCenterLine,
  RiAlignItemLeftLine,
  RiAlignItemRightLine
} from "@remixicon/react";

type ToolbarButtonProps = {
  label: string;
  active?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  children: ReactNode;
};

export function FakeToolbarRow({ children }: { children: ReactNode }) {
  return <div className="fakeToolbarRow">{children}</div>;
}

export function FakeToolbarGroup({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="fakeToolbarGroup" role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function FakeToolbarButton({ label, active = false, pressed = false, disabled = false, children }: ToolbarButtonProps) {
  const className = [
    "fakeToolbarButton",
    active ? "fakeToolbarButtonActive" : "",
    pressed ? "fakeToolbarButtonPressed" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" className={className} aria-label={label} aria-pressed={pressed || active} disabled={disabled}>
      {children}
    </button>
  );
}

export function AlignLeftIcon() {
  return <RiAlignItemLeftLine className="fakeToolbarButtonIcon" size={14} aria-hidden="true" />;
}

export function AlignCenterIcon() {
  return <RiAlignItemHorizontalCenterLine className="fakeToolbarButtonIcon" size={14} aria-hidden="true" />;
}

export function AlignRightIcon() {
  return <RiAlignItemRightLine className="fakeToolbarButtonIcon" size={14} aria-hidden="true" />;
}
