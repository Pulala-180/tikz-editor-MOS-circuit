import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RiAddLine, RiSendPlane2Line, RiStopMiniLine } from "@remixicon/react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getActiveEditorPlatform } from "../platform/current";
import { useEditorStore } from "../store/store";
import { CustomDropdown, type CustomDropdownOption } from "./CustomDropdown";
import { SidePanel } from "./SidePanel";
import {
  normalizePastedImageForAssistant,
  type AssistantComposerImageAttachment
} from "./assistant-image-attachments";
import type {
  AssistantAccountSnapshot,
  AssistantItem,
  AssistantModelOption,
  AssistantPendingApproval
} from "../platform/types";
import css from "./AssistantPanel.module.css";

type AssistantPanelProps = {
  onSubmitPrompt: (
    prompt: string,
    model: string | null,
    attachments: AssistantComposerImageAttachment[]
  ) => Promise<void>;
  onInterruptTurn: () => Promise<void>;
  onNewChat: () => void;
};

const AUTO_MODEL_VALUE = "__auto__";

const DEFAULT_ANTIGRAVITY_MODELS: AssistantModelOption[] = [
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
  { id: "gemini-3.8-pro", label: "Gemini 3.8 Pro" },
  { id: "claude-3-7-sonnet", label: "Claude 3.7 Sonnet" }
];

function logAssistantDebug(message: string, error?: unknown): void {
  if (typeof console === "undefined" || typeof console.info !== "function") {
    return;
  }
  if (error != null) {
    console.info(`[tikz-editor] ${message}`, error);
    return;
  }
  console.info(`[tikz-editor] ${message}`);
}

export function AssistantPanel({ onSubmitPrompt, onInterruptTurn, onNewChat }: AssistantPanelProps) {
  const activeDocumentId = useEditorStore((s) => s.activeDocumentId);
  const assistantApi = getActiveEditorPlatform().assistant;
  const assistantAvailable = typeof assistantApi?.startTurn === "function";
  const doc = useEditorStore((s) => s.documents[s.activeDocumentId]);
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modelOptions, setModelOptions] = useState<AssistantModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(AUTO_MODEL_VALUE);
  const [accountSnapshot, setAccountSnapshot] = useState<AssistantAccountSnapshot | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaRequested, setMetaRequested] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [pendingImageAttachments, setPendingImageAttachments] = useState<AssistantComposerImageAttachment[]>([]);
  const [expandedAttachmentId, setExpandedAttachmentId] = useState<string | null>(null);
  const nextAttachmentIdRef = useRef(0);
  const pendingImageAttachmentsRef = useRef<AssistantComposerImageAttachment[]>([]);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);

  const groupedItems = useMemo(() => {
    return (doc?.assistantItems ?? []).map((item) => ({
      key: item.id,
      item
    }));
  }, [doc?.assistantItems]);

  const dropdownOptions = useMemo<Array<CustomDropdownOption<string>>>(() => {
    const list: Array<CustomDropdownOption<string>> = [
      { value: AUTO_MODEL_VALUE, label: "Auto / 自动优选" }
    ];
    const seen = new Set<string>([AUTO_MODEL_VALUE]);
    for (const m of DEFAULT_ANTIGRAVITY_MODELS) {
      list.push({ value: m.id, label: m.label });
      seen.add(m.id);
    }
    for (const m of modelOptions) {
      if (!seen.has(m.id)) {
        list.push({ value: m.id, label: m.label });
        seen.add(m.id);
      }
    }
    return list;
  }, [modelOptions]);

  const accountMeta = useMemo(() => summarizeAccountMeta(accountSnapshot), [accountSnapshot]);
  const rateMeta = useMemo(() => summarizeRateMeta(accountSnapshot), [accountSnapshot]);
  const dropdownMetaLines = useMemo(() => {
    return [accountMeta, rateMeta, metaError].filter((line): line is string => line !== null && line.trim().length > 0);
  }, [accountMeta, metaError, rateMeta]);

  useEffect(() => {
    if (!metaRequested) {
      return;
    }
    let disposed = false;
    async function loadAssistantMeta(): Promise<void> {
      setMetaLoading(true);
      try {
        const [models, account] = await Promise.all([
          assistantApi?.listModels?.() ?? Promise.resolve([]),
          assistantApi?.readAccount?.() ?? Promise.resolve(null)
        ]);
        if (disposed) {
          return;
        }
        setModelOptions(models);
        setAccountSnapshot({ account, rateLimits: null });
        setMetaError(null);
        setMetaLoading(false);

        const rateLimits = await (assistantApi?.readRateLimits?.() ?? Promise.resolve(null));
        if (disposed) {
          return;
        }
        setAccountSnapshot((prev) => ({ ...prev, account: prev?.account ?? null, rateLimits }));
      } catch (error) {
        if (disposed) {
          return;
        }
        setMetaError(error instanceof Error ? error.message : String(error));
        setMetaLoading(false);
      }
    }
    void loadAssistantMeta();
    return () => {
      disposed = true;
    };
  }, [assistantApi, metaRequested]);

  useEffect(() => {
    pendingImageAttachmentsRef.current = pendingImageAttachments;
  }, [pendingImageAttachments]);

  useEffect(() => {
    return () => {
      for (const attachment of pendingImageAttachmentsRef.current) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    };
  }, []);

  useEffect(() => {
    if (!shouldStickToBottomRef.current) {
      return;
    }
    const timeline = timelineRef.current;
    if (!timeline) {
      return;
    }
    timeline.scrollTop = timeline.scrollHeight;
  }, [groupedItems.length, doc?.assistantPendingApprovals.length]);

  // Pre-warm the assistant process and fetch account info in the background
  useEffect(() => {
    if (!assistantAvailable || !assistantApi?.warmUp) {
      return;
    }
    let disposed = false;
    void (async () => {
      try {
        await assistantApi.warmUp?.();
        if (disposed) return;
        const account = await assistantApi.readAccount?.();
        if (disposed) return;
        if (account) {
          setAccountSnapshot((prev) => ({ ...prev, account, rateLimits: prev?.rateLimits ?? null }));
        }
      } catch (error) {
        logAssistantDebug("Assistant warmup preload ignored.", error);
      }
    })();
    return () => { disposed = true; };
  }, [assistantAvailable, assistantApi]);

  // Listen for account and rate limit updates
  useEffect(() => {
    if (!assistantApi?.bindEvents) {
      return;
    }
    return assistantApi.bindEvents((event) => {
      if (event.type === "account-updated") {
        void assistantApi.readAccount?.().then((account) => {
          setAccountSnapshot((prev) => ({ ...prev, account, rateLimits: prev?.rateLimits ?? null }));
        });
      } else if (event.type === "rate-limits-updated") {
        setAccountSnapshot((prev) => ({
          ...prev,
          account: prev?.account ?? null,
          rateLimits: event.rateLimits
        }));
      }
    });
  }, [assistantApi]);

  const isTurnRunning = doc ? (doc.assistantTurnStatus === "starting" || doc.assistantTurnStatus === "inProgress") : false;
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isTurnRunning) {
      setElapsedSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isTurnRunning]);

  if (!assistantAvailable) {
    return <div className={css.empty} data-select="text">当前平台不支持 AI 助手。</div>;
  }

  if (!doc) {
    return <div className={css.empty} data-select="text">没有活动文档。</div>;
  }

  const running = isTurnRunning;
  const hasPromptText = prompt.trim().length > 0;
  const composerAction = running && !hasPromptText ? "stop" : "send";
  const workingIndicatorLabel = elapsedSeconds > 0
    ? `Antigravity 正在思考与绘制… (${elapsedSeconds}s)`
    : "Antigravity 正在思考与绘制…";

  async function submitPrompt(): Promise<void> {
    const nextPrompt = prompt.trim();
    if (!nextPrompt || submitting) {
      return;
    }
    const attachmentsForTurn = [...pendingImageAttachments];
    setSubmitting(true);
    try {
      await onSubmitPrompt(nextPrompt, selectedModel === AUTO_MODEL_VALUE ? null : selectedModel, attachmentsForTurn);
      for (const attachment of attachmentsForTurn) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      setPrompt("");
      setPendingImageAttachments([]);
      setExpandedAttachmentId(null);
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (composerAction === "stop") {
      void onInterruptTurn();
      return;
    }
    void submitPrompt();
  }

  async function respondToApproval(
    requestId: string,
    decision: string
  ): Promise<void> {
    await getActiveEditorPlatform().assistant?.respondToApproval?.({
      documentId: activeDocumentId,
      requestId,
      decision
    });
  }

  return (
    <SidePanel className={css.panel} data-testid="assistant-panel">
      <SidePanel.Header className={css.header}>
        <div>
          <div className={css.title}>Antigravity 智能助手</div>
        </div>
        <button
          type="button"
          className={css.headerButton}
          onClick={onNewChat}
          disabled={running}
          data-testid="assistant-new-chat"
        >
          <RiAddLine size={14} aria-hidden="true" />
          <span>新对话</span>
        </button>
      </SidePanel.Header>

      {doc.assistantError ? <div className={css.error} data-select="text">{doc.assistantError}</div> : null}

      <SidePanel.Content
        className={css.timeline}
        data-testid="assistant-timeline"
        ref={timelineRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
          shouldStickToBottomRef.current = distanceFromBottom <= 48;
        }}
      >
        {groupedItems.length === 0 ? <div className={css.empty} data-select="text">向 Antigravity 描述您想绘制或修改的电路与图形。</div> : null}
        {groupedItems.map(({ key, item }) => (
          <AssistantTimelineItem key={key} item={item} />
        ))}
        {doc.assistantPendingApprovals.map((approval) => (
          <div key={approval.requestId} className={css.card}>
            <div className={css.cardTitle}>Approval Required</div>
            <ApprovalPreview approval={approval} />
            <div className={css.actions}>
              {approvalActions(approval).map((action) => (
                <button key={action.value} type="button" onClick={() => void respondToApproval(approval.requestId, action.value)}>
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </SidePanel.Content>

      <SidePanel.Footer>
        <form className={css.composer} onSubmit={handleSubmit}>
          {running ? (
            <div className={css.workingIndicator} data-select="text">
              <div className={css.spinnerInline} />
              <span>{workingIndicatorLabel}</span>
            </div>
          ) : null}
          {pendingImageAttachments.length > 0 ? (
            <div className={css.attachments} data-testid="assistant-attachments">
              {pendingImageAttachments.map((attachment) => (
                <div key={attachment.id} className={css.attachmentChip}>
                  <button
                    type="button"
                    className={css.attachmentPreviewButton}
                    onClick={() =>
                      { setExpandedAttachmentId((current) => (current === attachment.id ? null : attachment.id)); }
                    }
                    aria-label={`Preview ${attachment.fileName}`}
                  >
                    <img
                      alt={attachment.fileName}
                      src={attachment.previewUrl}
                      className={`${css.attachmentThumb} ${expandedAttachmentId === attachment.id ? css.attachmentThumbExpanded : ""}`}
                    />
                  </button>
                  <button
                    type="button"
                    className={css.attachmentRemove}
                    onClick={() => {
                      URL.revokeObjectURL(attachment.previewUrl);
                      setPendingImageAttachments((current) => current.filter((item) => item.id !== attachment.id));
                      setExpandedAttachmentId((current) => (current === attachment.id ? null : current));
                    }}
                    aria-label={`Remove ${attachment.fileName}`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <textarea
            value={prompt}
            onChange={(event) => { setPrompt(event.target.value); }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void submitPrompt();
              }
            }}
            onPaste={(event) => {
              const images = extractImageFilesFromClipboard(event.clipboardData);
              if (images.length === 0) {
                return;
              }
              event.preventDefault();
              void (async () => {
                try {
                  const normalized = await Promise.all(
                    images.map((file, index) => normalizePastedImageForAssistant(file, index))
                  );
                  const prepared: AssistantComposerImageAttachment[] = normalized.map((item) => ({
                    id: `attachment-${Date.now()}-${nextAttachmentIdRef.current++}`,
                    blob: item.blob,
                    mimeType: item.mimeType,
                    fileName: item.fileName,
                    previewUrl: URL.createObjectURL(item.blob)
                  }));
                  setPendingImageAttachments((current) => [...current, ...prepared]);
                } catch {
                  // Ignore failed clipboard images and keep composer editable.
                }
              })();
            }}
            placeholder="向 Antigravity 提出绘图或代码修改需求... (Enter 发送, Shift+Enter 换行)"
            disabled={submitting}
            rows={4}
            data-testid="assistant-prompt"
          />
          <div className={css.composerRow}>
            <div className={css.modelPicker}>
              <CustomDropdown
                ariaLabel="Model"
                options={dropdownOptions}
                value={selectedModel}
                onChange={(value) => { setSelectedModel(value); }}
                onOpen={() => {
                  if (!metaRequested) {
                    setMetaLoading(true);
                    // Defer metaRequested to ensure the dropdown has a chance to paint 
                    // the spinner before the potentially blocking listModels call.
                    setTimeout(() => {
                      setMetaRequested(true);
                    }, 100);
                  }
                }}
                disabled={submitting || running}
                menuHeader={metaLoading ? (
                  <div className={css.dropdownLoading}>
                    <div className={css.spinner} />
                    <span>加载可用模型...</span>
                  </div>
                ) : dropdownMetaLines.length > 0 ? (
                  <div className={css.dropdownMeta} data-select="text">
                    {dropdownMetaLines.map((line, index) => (
                      <div key={`${index}:${line}`}>{line}</div>
                    ))}
                  </div>
                ) : null}
                triggerClassName={css.modelTrigger}
                menuClassName={css.modelMenu}
                optionClassName={css.modelOption}
                optionSelectedClassName={css.modelOptionSelected}
              />
            </div>
            <button
              className={css.composerAction}
              type="submit"
              disabled={submitting || (composerAction === "send" && !hasPromptText)}
              aria-label={composerAction === "stop" ? "Stop assistant" : "Send message"}
              title={composerAction === "stop" ? "Stop" : "Send"}
              data-testid="assistant-send"
            >
              {composerAction === "stop" ? (
                <RiStopMiniLine size={15} aria-hidden="true" />
              ) : (
                <RiSendPlane2Line size={15} aria-hidden="true" />
              )}
            </button>
          </div>
        </form>
      </SidePanel.Footer>
    </SidePanel>
  );
}

function extractImageFilesFromClipboard(clipboardData: DataTransfer | null): File[] {
  if (!clipboardData?.items) {
    return [];
  }
  const files: File[] = [];
  for (const item of Array.from(clipboardData.items)) {
    if (item.kind !== "file") {
      continue;
    }
    if (!item.type.startsWith("image/")) {
      continue;
    }
    const file = item.getAsFile();
    if (file) {
      files.push(file);
    }
  }
  return files;
}

type TokenType = "comment" | "command" | "math" | "coordinate" | "string" | "number" | "keyword" | "punctuation" | "text";

function isTikzCode(code: string): boolean {
  return /\\(draw|node|path|fill|clip|coordinate|begin\{tikzpicture\}|tikzset|foreach|matrix|graph)\b/.test(code);
}

function tokenizeTikz(code: string): Array<{ type: TokenType; text: string }> {
  const tokens: Array<{ type: TokenType; text: string }> = [];
  const regex = /(%[^\n]*)|(\\[a-zA-Z@]+)|(\$[^$\n]*\$)|(\([^)\n]*\))|(\b\d+(?:\.\d+)?(?:cm|pt|mm|in|em|ex|deg)?\b)|([{}[\],;])/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: "text", text: code.slice(lastIndex, match.index) });
    }
    if (match[1]) {
      tokens.push({ type: "comment", text: match[1] });
    } else if (match[2]) {
      tokens.push({ type: "command", text: match[2] });
    } else if (match[3]) {
      tokens.push({ type: "math", text: match[3] });
    } else if (match[4]) {
      tokens.push({ type: "coordinate", text: match[4] });
    } else if (match[5]) {
      tokens.push({ type: "number", text: match[5] });
    } else if (match[6]) {
      tokens.push({ type: "punctuation", text: match[6] });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < code.length) {
    tokens.push({ type: "text", text: code.slice(lastIndex) });
  }
  return tokens;
}

function tokenizeGeneric(code: string): Array<{ type: TokenType; text: string }> {
  const tokens: Array<{ type: TokenType; text: string }> = [];
  const regex = /(\/\/[^\n]*|#[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b(?:const|let|var|function|return|if|else|for|while|import|export|from|class|type|interface|true|false|null|undefined|def|async|await)\b)|(\b\d+(?:\.\d+)?\b)|([{}()[\].,;:])/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: "text", text: code.slice(lastIndex, match.index) });
    }
    if (match[1]) {
      tokens.push({ type: "comment", text: match[1] });
    } else if (match[2]) {
      tokens.push({ type: "string", text: match[2] });
    } else if (match[3]) {
      tokens.push({ type: "keyword", text: match[3] });
    } else if (match[4]) {
      tokens.push({ type: "number", text: match[4] });
    } else if (match[5]) {
      tokens.push({ type: "punctuation", text: match[5] });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < code.length) {
    tokens.push({ type: "text", text: code.slice(lastIndex) });
  }
  return tokens;
}

function tokenClass(type: TokenType): string {
  switch (type) {
    case "comment": return css.tokenComment;
    case "command": return css.tokenCommand;
    case "math": return css.tokenMath;
    case "coordinate": return css.tokenCoordinate;
    case "number": return css.tokenNumber;
    case "string": return css.tokenString;
    case "keyword": return css.tokenKeyword;
    case "punctuation": return css.tokenPunctuation;
    default: return css.tokenText;
  }
}

function AssistantCodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Ignore clipboard write error
    }
  }, [code]);

  const langDisplay = (language || (isTikzCode(code) ? "tikz" : "code")).toUpperCase();
  const tokens = useMemo(() => {
    const isTikz = language === "tikz" || language === "latex" || language === "tex" || isTikzCode(code);
    return isTikz ? tokenizeTikz(code) : tokenizeGeneric(code);
  }, [code, language]);

  return (
    <div className={css.codeBlockCard}>
      <div className={css.codeBlockHeader}>
        <span className={css.codeBlockLang}>{langDisplay}</span>
        <button
          type="button"
          className={css.codeCopyButton}
          onClick={() => void handleCopy()}
          title="复制代码到剪贴板"
        >
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className={css.codePre}>
        <code className={css.codeContent}>
          {tokens.map((token, index) => (
            <span key={index} className={tokenClass(token.type)}>
              {token.text}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

const markdownComponents = {
  code({ className, children, ...props }: { className?: string; children?: ReactNode }) {
    const match = /language-(\w+)/.exec(className || "");
    const codeString = Array.isArray(children)
      ? children.map(String).join("")
      : String(children ?? "").replace(/\n$/, "");
    const isBlock = Boolean(match) || codeString.includes("\n");

    if (isBlock) {
      const language = match ? match[1] : "";
      return <AssistantCodeBlock code={codeString} language={language} />;
    }

    return (
      <code className={css.inlineCode} {...props}>
        {children}
      </code>
    );
  },
  pre({ children }: { children?: ReactNode }) {
    return <>{children}</>;
  }
};

function AssistantTimelineItem({ item }: { item: AssistantItem }) {
  const [imageExpanded, setImageExpanded] = useState(false);
  if (item.type === "userMessage") {
    const contentList = Array.isArray(item.content) ? item.content : [];
    const normalized = normalizeUserMessage(contentList);
    return (
      <div className={`${css.card} ${css.userCard} ${css.userMessageBubble}`}>
        <div className={css.messageBody} data-select="text">
          <div className={css.markdownContent}>
            <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {normalized.visibleText}
            </Markdown>
          </div>
          {normalized.attachmentUrls.length > 0 ? (
            <div className={css.historyAttachments}>
              {normalized.attachmentUrls.map((url, index) => (
                <img key={`${index}:${url}`} src={url} alt={`Attachment ${index + 1}`} className={css.historyAttachmentThumb} />
              ))}
            </div>
          ) : null}
          {normalized.hasAttachment ? <div className={css.attachmentHint}>PNG snapshot attached</div> : null}
          {normalized.rawPrompt && normalized.rawPrompt !== normalized.visibleText ? (
            <details className={css.rawPrompt}>
              <summary className={css.rawPromptSummary}>Expand to see packaging</summary>
              <pre className={css.detail} data-select="text">{normalized.rawPrompt}</pre>
            </details>
          ) : null}
        </div>
      </div>
    );
  }

  if (item.type === "agentMessage") {
    const text = asString(item.text);
    if (!text) {
      return (
        <div className={css.agentMessageBare} data-select="text">
          <div className={css.agentThinkingPlaceholder}>
            <span className={css.thinkingDot} />
            <span className={css.thinkingDot} />
            <span className={css.thinkingDot} />
            <span style={{ marginLeft: 4 }}>Antigravity 正在思考与组织 TikZ 方案…</span>
          </div>
        </div>
      );
    }
    return (
      <div className={css.agentMessageBare} data-select="text">
        <div className={css.markdownContent}>
          <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {text}
          </Markdown>
        </div>
      </div>
    );
  }

  if (item.type === "plan") {
    return (
      <div className={css.card}>
        <div className={css.cardTitle}>计划</div>
        <div className={css.messageBody} data-select="text">
          <div className={css.markdownContent}>
            <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {asString(item.text)}
            </Markdown>
          </div>
        </div>
      </div>
    );
  }

  if (item.type === "reasoning") {
    return (
      <div className={css.reasoningInline}>
        <div className={css.reasoningBody} data-select="text">
          {item.summary ? (
            <div className={css.markdownContent}>
              <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {asString(item.summary)}
              </Markdown>
            </div>
          ) : null}
          {item.content ? (
            <div className={css.markdownContent}>
              <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {asString(item.content)}
              </Markdown>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (item.type === "commandExecution") {
    const command = displayCommand(item.command);
    const status = asString(item.status) || "completed";
    return (
      <details className={css.details}>
        <summary>{summarizeCommandExecution(command)}</summary>
        <div className={css.messageBody} data-select="text">
          <div className={css.attachmentHint}>
            Status: {status}
            {typeof item.exitCode === "number" ? ` · exit ${item.exitCode}` : ""}
            {typeof item.durationMs === "number" ? ` · ${item.durationMs}ms` : ""}
          </div>
          {item.aggregatedOutput ? <pre className={css.detail} data-select="text">{asString(item.aggregatedOutput)}</pre> : null}
        </div>
      </details>
    );
  }

  if (item.type === "fileChange") {
    const changes = Array.isArray(item.changes) ? item.changes : [];
    const summaries = changes
      .map((change) => {
        const record = asRecord(change);
        const path = typeof record?.path === "string" ? record.path : null;
        const diff = typeof record?.diff === "string" ? record.diff : "";
        return { path, diff, stats: countDiffStats(diff) };
      })
      .filter((change) => change.diff.trim().length > 0);
    const totals = summaries.reduce(
      (acc, change) => ({ added: acc.added + change.stats.added, removed: acc.removed + change.stats.removed }),
      { added: 0, removed: 0 }
    );
    return (
      <details className={css.details}>
        <summary>
          Edited code
          {totals.added > 0 || totals.removed > 0 ? ` +${totals.added} -${totals.removed}` : ""}
        </summary>
        <div className={css.messageBody} data-select="text">
          {summaries.length === 0 ? (
            <div className={css.attachmentHint}>No diff available.</div>
          ) : (
            summaries.map((change, index) => (
              <div key={`${index}:${change.path ?? "unknown"}`} className={css.diffBlock}>
                {change.path ? <div className={css.attachmentHint}>{change.path}</div> : null}
                <div className={css.diffScroll}>
                  <pre className={css.diffPre} data-select="text">
                    {change.diff.split("\n").map((line, lineIndex) => (
                      <span
                        key={`${lineIndex}:${line}`}
                        className={
                          line.startsWith("+") && !line.startsWith("+++")
                            ? css.diffLineAdded
                            : line.startsWith("-") && !line.startsWith("---")
                            ? css.diffLineRemoved
                            : css.diffLineContext
                        }
                      >
                        {line}
                        {"\n"}
                      </span>
                    ))}
                  </pre>
                </div>
              </div>
            ))
          )}
        </div>
      </details>
    );
  }

  if (item.type === "dynamicToolCall") {
    const contentItems = Array.isArray(item.contentItems) ? item.contentItems : [];
    const previewImage = extractContentImageUrl(contentItems);
    const previewText = extractContentText(contentItems);
    const isPngPreview = item.tool === "get_latest_preview_png" || Boolean(previewImage);
    return (
      <details className={css.details}>
        <summary>{isPngPreview ? "Requested PNG snapshot" : "Requested tool call"}</summary>
        <div className={css.messageBody} data-select="text">
          {previewText ? <div className={css.attachmentHint}>{previewText}</div> : null}
          {previewImage ? (
            <img
              alt="Tool preview"
              src={previewImage}
              className={imageExpanded ? css.toolPreviewImageExpanded : css.toolPreviewImage}
              onClick={() => { setImageExpanded(!imageExpanded); }}
            />
          ) : null}
        </div>
      </details>
    );
  }

  return (
    <details className={css.details}>
      <summary>{item.type}</summary>
      <pre className={css.detail} data-select="text">{JSON.stringify(item, null, 2)}</pre>
    </details>
  );
}

function normalizeUserMessage(contentList: unknown[]): {
  visibleText: string;
  rawPrompt: string | null;
  hasAttachment: boolean;
  attachmentUrls: string[];
} {
  let rawPrompt = "";
  let hasAttachment = false;
  const attachmentUrls: string[] = [];
  for (const content of contentList) {
    if (!content || typeof content !== "object") {
      continue;
    }
    const candidate = content as { type?: unknown; text?: unknown; url?: unknown; path?: unknown };
    if (candidate.type === "text") {
      const next = asString(candidate.text);
      rawPrompt = rawPrompt ? `${rawPrompt}\n\n${next}` : next;
    } else {
      hasAttachment = true;
      if (candidate.type === "image" && typeof candidate.url === "string" && candidate.url.trim()) {
        attachmentUrls.push(candidate.url);
      }
      if (candidate.type === "localImage" && typeof candidate.path === "string" && candidate.path.trim()) {
        const value = candidate.path.trim();
        if (value.startsWith("data:") || value.startsWith("blob:") || value.startsWith("http://") || value.startsWith("https://")) {
          attachmentUrls.push(value);
        }
      }
    }
  }
  const extracted = extractUserRequest(rawPrompt);
  return {
    visibleText: extracted ?? rawPrompt,
    rawPrompt: rawPrompt || null,
    hasAttachment,
    attachmentUrls
  };
}

function extractUserRequest(text: string): string | null {
  const marker = "User request:";
  const index = text.lastIndexOf(marker);
  if (index < 0) {
    return null;
  }
  const extracted = text.slice(index + marker.length).trim();
  return extracted || null;
}

function renderTextWithBreaks(text: string): ReactNode {
  const lines = text.split("\n");
  return lines.map((line, index) => (
    <Fragment key={`${index}:${line}`}>
      {index > 0 ? <br /> : null}
      {line}
    </Fragment>
  ));
}

function summarizeAccountMeta(snapshot: AssistantAccountSnapshot | null): string | null {
  const accountResult = asRecord(snapshot?.account);
  const account = asRecord(accountResult?.account) ?? accountResult;
  const name = typeof account?.name === "string" && account.name.trim() ? account.name : null;
  const email = typeof account?.email === "string" && account.email.trim() ? account.email : null;
  if (name && email) {
    return `用户: ${name} (${email})`;
  }
  if (email) {
    return `用户: ${email}`;
  }
  if (name) {
    return `用户: ${name}`;
  }
  return "Antigravity: 已就绪";
}

function summarizeRateMeta(snapshot: AssistantAccountSnapshot | null): string | null {
  const rateResult = asRecord(snapshot?.rateLimits);
  const primary = extractRateWindow(asRecord(rateResult?.rateLimits));
  if (primary) {
    return `配额: ${primary}`;
  }

  const limitsById = asRecord(rateResult?.rateLimitsByLimitId);
  if (limitsById) {
    const firstSnapshot = Object.values(limitsById)
      .map((value) => asRecord(value))
      .find((value) => value != null);
    const fallback = extractRateWindow(firstSnapshot);
    if (fallback) {
      return `配额: ${fallback}`;
    }
  }
  return null;
}

function extractRateWindow(snapshot: Record<string, unknown> | null | undefined): string | null {
  if (!snapshot) {
    return null;
  }
  const primary = asRecord(snapshot.primary);
  const secondary = asRecord(snapshot.secondary);
  const primaryText = formatRateWindow(primary, "short");
  const secondaryText = formatRateWindow(secondary, "day");

  if (primaryText && secondaryText) {
    return `${primaryText} · ${secondaryText}`;
  }
  return primaryText ?? secondaryText;
}

function formatRateWindow(
  window: Record<string, unknown> | null | undefined,
  fallbackLabel: "short" | "day"
): string | null {
  if (!window) {
    return null;
  }
  const usedPercent = asNumber(window.usedPercent);
  if (usedPercent == null) {
    return null;
  }
  const durationMins = asNumber(window.windowDurationMins);
  const durationLabel = durationMins != null
    ? durationMins === 60 * 24 * 7
      ? "week"
      : durationMins >= 60
      ? `${Math.round(durationMins / 60)}h`
      : `${Math.round(durationMins)}m`
    : fallbackLabel;
  return `${usedPercent}% used (${durationLabel})`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value.toString();
  }
  return "";
}

function ApprovalPreview({ approval }: { approval: AssistantPendingApproval }) {
  if (approval.kind === "command") {
    const command = displayCommand(approval.command);
    const reason = asString(approval.reason);
    const availableDecisions = formatAvailableDecisions(approval.availableDecisions);
    return (
      <div className={css.messageBody} data-select="text">
        {reason ? <div>{reason}</div> : null}
        {command ? <div className={css.attachmentHint}>Command: <code>{command}</code></div> : null}
        {approval.cwd ? <div className={css.attachmentHint}>CWD: {approval.cwd}</div> : null}
        {availableDecisions ? <div className={css.attachmentHint}>Choices: {availableDecisions}</div> : null}
      </div>
    );
  }

  if (approval.kind === "fileChange") {
    return (
      <div className={css.messageBody} data-select="text">
        {approval.reason ? <div>{approval.reason}</div> : null}
        {approval.grantRoot ? <div className={css.attachmentHint}>Requested root: {approval.grantRoot}</div> : null}
      </div>
    );
  }

  return <pre className={css.detail} data-select="text">{JSON.stringify(approval.payload, null, 2)}</pre>;
}

function displayCommand(command: unknown): string | null {
  if (Array.isArray(command)) {
    const parts = command.map((part) => asString(part)).filter((part) => part.length > 0);
    return parts.length > 0 ? parts.join(" ") : null;
  }
  const text = asString(command).trim();
  if (!text) {
    return null;
  }
  const shellWrapped = text.match(/^\/bin\/zsh -lc ['"](.*)['"]$/);
  if (shellWrapped?.[1]) {
    return shellWrapped[1];
  }
  return text;
}

function formatAvailableDecisions(choices: unknown[] | undefined): string | null {
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }
  const labels = choices
    .map((choice) => {
      if (typeof choice === "string") {
        return choice;
      }
      const record = asRecord(choice);
      if (!record) {
        return null;
      }
      const keys = Object.keys(record);
      return keys.length > 0 ? keys[0] : null;
    })
    .filter((value): value is string => value !== null && value.trim().length > 0);
  return labels.length > 0 ? labels.join(", ") : null;
}

function extractContentText(contentItems: unknown[]): string | null {
  for (const item of contentItems) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }
    if (record.type === "inputText" && typeof record.text === "string" && record.text.trim()) {
      return record.text;
    }
  }
  return null;
}

function extractContentImageUrl(contentItems: unknown[]): string | null {
  for (const item of contentItems) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }
    if (record.type === "inputImage" && typeof record.imageUrl === "string" && record.imageUrl.trim()) {
      return record.imageUrl;
    }
  }
  return null;
}

function summarizeCommandExecution(command: string | null): ReactNode {
  if (!command) {
    return "Ran command";
  }
  if (isFigureTexReadCommand(command)) {
    return "Read the code";
  }
  return <>Ran <code>{command}</code></>;
}

function isFigureTexReadCommand(command: string): boolean {
  const normalized = command.trim();
  if (!/\bfigure\.tex\b/.test(normalized)) {
    return false;
  }
  const readPrefix = /^(cat|sed|head|tail|less|more|nl|awk|grep|rg|wc)\b/;
  return readPrefix.test(normalized);
}

function countDiffStats(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ") || line.startsWith("--- ") || line.startsWith("@@")) {
      continue;
    }
    if (line.startsWith("+")) {
      added += 1;
      continue;
    }
    if (line.startsWith("-")) {
      removed += 1;
      continue;
    }
  }
  return { added, removed };
}

function approvalActions(approval: AssistantPendingApproval): Array<{ value: string; label: string }> {
  if (approval.kind !== "command") {
    return [
      { value: "accept", label: "Allow" },
      { value: "decline", label: "Deny" },
      { value: "cancel", label: "Cancel" }
    ];
  }
  const offered = Array.isArray(approval.availableDecisions)
    ? approval.availableDecisions
      .map((choice) => {
        if (typeof choice === "string") {
          return choice;
        }
        const record = asRecord(choice);
        if (!record) {
          return null;
        }
        const keys = Object.keys(record);
        return keys.length > 0 ? keys[0] : null;
      })
      .filter((value): value is string => value !== null && value.trim().length > 0)
    : [];
  if (offered.length === 0) {
    return [
      { value: "accept", label: "Allow" },
      { value: "decline", label: "Deny" },
      { value: "cancel", label: "Cancel" }
    ];
  }
  return offered.map((value) => ({
    value,
    label: humanizeDecision(value)
  }));
}

function humanizeDecision(value: string): string {
  switch (value) {
    case "accept":
      return "Allow";
    case "acceptForSession":
      return "Allow this session";
    case "decline":
      return "Deny";
    case "cancel":
      return "Cancel";
    case "acceptWithExecpolicyAmendment":
      return "Allow with changes";
    default:
      return value;
  }
}
