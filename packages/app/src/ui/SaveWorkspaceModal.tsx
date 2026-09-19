import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { getDockLayoutHandle } from "./DockLayout";
import { useWorkspaceListStore } from "../store/workspace-list-store";
import { isReservedWorkspaceName } from "./workspace-apply";
import css from "./SaveWorkspaceModal.module.css";

type SaveWorkspaceModalProps = {
  onClose: () => void;
};

export function SaveWorkspaceModal({ onClose }: SaveWorkspaceModalProps) {
  const [name, setName] = useState("");
  const [pendingOverwriteId, setPendingOverwriteId] = useState<string | null>(null);
  const userWorkspaces = useWorkspaceListStore((s) => s.userWorkspaces);
  const createWorkspace = useWorkspaceListStore((s) => s.createWorkspace);
  const overwriteWorkspace = useWorkspaceListStore((s) => s.overwriteWorkspace);

  const trimmed = name.trim();
  const reserved = trimmed.length > 0 && isReservedWorkspaceName(trimmed);
  const existingMatch = useMemo(
    () => userWorkspaces.find((ws) => ws.name.toLowerCase() === trimmed.toLowerCase()) ?? null,
    [userWorkspaces, trimmed]
  );

  const canSubmit = trimmed.length > 0 && !reserved;

  function onSubmit(event: React.FormEvent): void {
    event.preventDefault();
    if (!canSubmit) return;

    const handle = getDockLayoutHandle();
    if (!handle) {
      onClose();
      return;
    }
    const json = handle.getCurrentJson();

    if (existingMatch) {
      setPendingOverwriteId(existingMatch.id);
      return;
    }

    createWorkspace(trimmed, json);
    onClose();
  }

  function confirmOverwrite(): void {
    if (!pendingOverwriteId) return;
    const handle = getDockLayoutHandle();
    if (!handle) {
      onClose();
      return;
    }
    overwriteWorkspace(pendingOverwriteId, handle.getCurrentJson());
    onClose();
  }

  if (pendingOverwriteId) {
    return (
      <Modal
        onClose={onClose}
        size="sm"
        labelledBy="save-workspace-modal-title"
        dataTestId="save-workspace-overwrite-modal"
      >
        <Modal.Header
          title="覆盖已有工作区？"
          titleId="save-workspace-modal-title"
          showCloseButton
          onClose={onClose}
          closeAriaLabel="关闭工作区保存对话框"
        />
        <Modal.Body>
          <p className={css.message}>
            工作区“{trimmed}”已存在。是否使用当前布局覆盖它？
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Modal.SecondaryButton onClick={() => { setPendingOverwriteId(null); }}>
            返回
          </Modal.SecondaryButton>
          <Modal.PrimaryButton
            onClick={confirmOverwrite}
            data-testid="save-workspace-overwrite-confirm"
          >
            覆盖
          </Modal.PrimaryButton>
        </Modal.Footer>
      </Modal>
    );
  }

  return (
    <Modal
      onClose={onClose}
      size="sm"
      labelledBy="save-workspace-modal-title"
      dataTestId="save-workspace-modal"
    >
      <form onSubmit={onSubmit} className={css.form}>
        <Modal.Header
          title="工作区另存为…"
          titleId="save-workspace-modal-title"
          showCloseButton
          onClose={onClose}
          closeAriaLabel="关闭工作区保存对话框"
        />
        <Modal.Body>
          <label className={css.field}>
            <span className={css.fieldLabel}>工作区名称</span>
            <input
              data-testid="save-workspace-name-input"
              autoFocus
              type="text"
              className={css.input}
              value={name}
              placeholder="输入工作区名称"
              onChange={(event) => { setName(event.target.value); }}
            />
          </label>
          {reserved ? (
            <p className={css.warning}>该名称已被内置工作区占用。</p>
          ) : existingMatch ? (
            <p className={css.hint}>保存时将提示是否覆盖已有工作区“{existingMatch.name}”。</p>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Modal.SecondaryButton onClick={onClose}>取消</Modal.SecondaryButton>
          <Modal.PrimaryButton
            type="submit"
            disabled={!canSubmit}
            data-testid="save-workspace-confirm"
          >
            保存
          </Modal.PrimaryButton>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
