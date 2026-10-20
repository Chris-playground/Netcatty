import React, { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { RE2JS } from "re2js";
import type { Host, HostTotpConfig } from "../domain/models";
import { netcattyBridge } from "@/infrastructure/services/netcattyBridge.ts";
import { Button } from "./ui/button";
import { HostDetailsSettingRow } from "./host-details";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";

type Preview = {
  uri: string;
  code: string;
  secondsRemaining: number;
  issuer?: string;
  label?: string;
  algorithm?: string;
  digits?: number;
  period?: number;
};

type HostTotpFieldsProps = {
  t: (key: string, params?: Record<string, string | number>) => string;
  form: Host;
  setForm: (updater: Host | ((host: Host) => Host)) => void;
  effectiveProtocol?: string;
};

const HIDDEN_PROTOCOLS = new Set(["telnet", "serial"]);

function errorKey(error: string | undefined): string {
  switch (error) {
    case "hotp":
      return "hostDetails.totp.error.hotp";
    case "migration":
      return "hostDetails.totp.error.migration";
    case "not-found":
      return "hostDetails.totp.error.notFound";
    case "screen-permission-denied":
      return "hostDetails.totp.error.permission";
    case "unavailable":
      return "hostDetails.totp.error.unavailable";
    case "pattern":
      return "hostDetails.totp.error.pattern";
    default:
      return "hostDetails.totp.error.invalid";
  }
}

async function decodeQrFile(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("unavailable");
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(image.data, image.width, image.height)?.data || "";
  } finally {
    bitmap.close?.();
  }
}

function validPattern(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length > 200) return null;
  try {
    RE2JS.compile(trimmed);
    return trimmed;
  } catch {
    return null;
  }
}

export const HostTotpFields: React.FC<HostTotpFieldsProps> = ({
  t,
  form,
  setForm,
  effectiveProtocol,
}) => {
  const configured = Boolean(form.totp?.uri);
  const [open, setOpen] = useState(configured);
  const [draft, setDraft] = useState("");
  const [pattern, setPattern] = useState(form.totp?.promptPattern || "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const hostIdRef = useRef(form.id);
  const [trackedHostId, setTrackedHostId] = useState(form.id);
  if (form.id !== trackedHostId) {
    setTrackedHostId(form.id);
    setOpen(configured);
    setPattern(form.totp?.promptPattern || "");
    setDraft("");
    setError(null);
    setPreview(null);
    setSecondsLeft(null);
    setBusy(false);
    setScanning(false);
  }
  hostIdRef.current = form.id;

  useEffect(() => {
    if (configured) setOpen(true);
  }, [configured]);

  useEffect(() => {
    if (!preview) return undefined;
    const endsAt = Date.now() + preview.secondsRemaining * 1000;
    const uri = preview.uri;
    let refreshed = false;
    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left !== 0 || refreshed) return;
      refreshed = true;
      const bridge = netcattyBridge.get();
      if (!bridge?.previewTotp) return;
      const hostId = hostIdRef.current;
      void bridge.previewTotp({ text: uri }).then((result) => {
        if (hostIdRef.current !== hostId || !result?.ok || !result.code) return;
        setPreview((current) => current && current.uri === uri
          ? {
            ...current,
            code: result.code,
            secondsRemaining: result.secondsRemaining || current.period || 30,
          }
          : current);
      }).catch(() => undefined);
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [preview]);

  if (effectiveProtocol && HIDDEN_PROTOCOLS.has(effectiveProtocol)) return null;

  const writeTotp = (next: HostTotpConfig | undefined) => {
    setForm((current) => {
      const updated = { ...current };
      if (next?.uri) updated.totp = next;
      else delete updated.totp;
      return updated;
    });
  };

  const remember = (result: Preview & { ok?: boolean }) => {
    if (hostIdRef.current !== form.id) return;
    const patternValue = validPattern(pattern);
    setPreview(result);
    setError(null);
    setDraft("");
    writeTotp({
      uri: result.uri,
      autoSubmit: form.totp?.autoSubmit !== false,
      ...(patternValue ? { promptPattern: patternValue } : {}),
    });
  };

  const applyText = async (text: string) => {
    const expectedHostId = form.id;
    const bridge = netcattyBridge.get();
    if (!bridge?.previewTotp) {
      setError("unavailable");
      return;
    }
    setBusy(true);
    try {
      const result = await bridge.previewTotp({ text });
      if (hostIdRef.current !== expectedHostId) return;
      if (!result?.ok || !result.uri || !result.code) {
        setPreview(null);
        setError(result?.error || "invalid");
        return;
      }
      remember({
        uri: result.uri,
        code: result.code,
        secondsRemaining: result.secondsRemaining || 30,
        issuer: result.issuer,
        label: result.label,
        algorithm: result.algorithm,
        digits: result.digits,
        period: result.period,
      });
    } catch {
      if (hostIdRef.current === expectedHostId) setError("unavailable");
    } finally {
      if (hostIdRef.current === expectedHostId) setBusy(false);
    }
  };

  const scanScreen = async () => {
    const expectedHostId = form.id;
    const bridge = netcattyBridge.get();
    if (!bridge?.scanTotpQrFromScreen) {
      setError("unavailable");
      return;
    }
    setBusy(true);
    setScanning(true);
    try {
      const result = await bridge.scanTotpQrFromScreen();
      if (hostIdRef.current !== expectedHostId) return;
      if (!result?.ok || !result.uri || !result.code) {
        setPreview(null);
        setError(result?.error || "not-found");
        return;
      }
      remember({
        uri: result.uri,
        code: result.code,
        secondsRemaining: result.secondsRemaining || 30,
        issuer: result.issuer,
        label: result.label,
        algorithm: result.algorithm,
        digits: result.digits,
        period: result.period,
      });
    } catch {
      if (hostIdRef.current === expectedHostId) setError("unavailable");
    } finally {
      if (hostIdRef.current === expectedHostId) {
        setBusy(false);
        setScanning(false);
      }
    }
  };

  const commitPattern = (value: string) => {
    setPattern(value);
    if (!form.totp?.uri) return;
    const patternValue = validPattern(value);
    if (patternValue == null) {
      setError("pattern");
      return;
    }
    setError((current) => (current === "pattern" ? null : current));
    writeTotp({
      ...form.totp,
      ...(patternValue ? { promptPattern: patternValue } : { promptPattern: undefined }),
    });
  };

  return (
    <div className="space-y-3 rounded-md border border-border/60 p-3">
      <HostDetailsSettingRow label={t("hostDetails.totp.title")} hint={t("hostDetails.totp.enable")}>
        <Switch
          checked={open}
          onCheckedChange={(checked) => {
            setOpen(checked);
            if (!checked) {
              setPreview(null);
              setError(null);
              setDraft("");
              writeTotp(undefined);
            }
          }}
          aria-label={t("hostDetails.totp.title")}
        />
      </HostDetailsSettingRow>
      {open && (
        <>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("hostDetails.totp.warning")}</p>
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              if (draft.trim()) void applyText(draft);
            }}
            placeholder={t("hostDetails.totp.secretPlaceholder")}
            aria-label={t("hostDetails.totp.secret")}
            className="h-8 font-mono text-xs"
            disabled={busy}
            spellCheck={false}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
              {t("hostDetails.totp.importQr")}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { void scanScreen(); }}>
              {scanning ? t("hostDetails.totp.scanning") : t("hostDetails.totp.scanScreen")}
            </Button>
            {configured && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPreview(null);
                  setOpen(false);
                  writeTotp(undefined);
                }}
              >
                {t("hostDetails.totp.clear")}
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setBusy(true);
                void decodeQrFile(file)
                  .then((text) => {
                    if (!text) {
                      setError("not-found");
                      setBusy(false);
                      return;
                    }
                    return applyText(text);
                  })
                  .catch(() => {
                    setError("invalid");
                    setBusy(false);
                  });
              }}
            />
          </div>
          {preview && (
            <div className="flex items-baseline justify-between gap-3 rounded-md bg-muted/50 px-3 py-2">
              <div>
                <div className="text-xs text-muted-foreground">{t("hostDetails.totp.preview")}</div>
                <div className="font-mono text-lg tracking-widest">{preview.code}</div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <div>{t("hostDetails.totp.countdown", { seconds: secondsLeft ?? preview.secondsRemaining })}</div>
                <div>{[preview.issuer, preview.label].filter(Boolean).join(" · ")}</div>
                <div>{preview.algorithm} · {preview.digits} · {preview.period}s</div>
              </div>
            </div>
          )}
          {configured && (
            <>
              <HostDetailsSettingRow label={t("hostDetails.totp.autoSubmit")} hint={t("hostDetails.totp.autoSubmitDesc")}>
                <Switch
                  checked={form.totp?.autoSubmit !== false}
                  onCheckedChange={(checked) => {
                    if (!form.totp) return;
                    writeTotp({ ...form.totp, autoSubmit: checked });
                  }}
                  aria-label={t("hostDetails.totp.autoSubmit")}
                />
              </HostDetailsSettingRow>
              <Input
                value={pattern}
                onChange={(event) => commitPattern(event.target.value)}
                placeholder={t("hostDetails.totp.promptPatternPlaceholder")}
                aria-label={t("hostDetails.totp.promptPattern")}
                className="h-8 font-mono text-xs"
                spellCheck={false}
              />
            </>
          )}
          {error && <p className="text-xs text-destructive">{t(errorKey(error))}</p>}
        </>
      )}
    </div>
  );
};
