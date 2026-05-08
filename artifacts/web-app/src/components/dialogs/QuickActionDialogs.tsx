import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/* ---------------- Text input ---------------- */

interface TextInputDialogProps {
  open: boolean;
  title: string;
  description?: string;
  placeholder?: string;
  initialValue?: string;
  onCancel: () => void;
  onSubmit: (text: string) => void;
}

export function TextInputDialog({
  open,
  title,
  description,
  placeholder,
  initialValue = "",
  onCancel,
  onSubmit,
}: TextInputDialogProps) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-text-input">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <Textarea
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          rows={6}
          data-testid="textarea-quickaction-input"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} data-testid="button-cancel">
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit(value.trim())}
            disabled={!value.trim()}
            data-testid="button-submit"
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Language picker ---------------- */

const LANGUAGES = [
  "Bangla",
  "English",
  "Hindi",
  "Arabic",
  "Urdu",
  "Spanish",
  "Chinese",
];

interface LanguagePickerDialogProps {
  open: boolean;
  initialInput?: string;
  needsInput: boolean;
  onCancel: () => void;
  onSubmit: (data: { targetLang: string; input: string }) => void;
}

export function LanguagePickerDialog({
  open,
  initialInput = "",
  needsInput,
  onCancel,
  onSubmit,
}: LanguagePickerDialogProps) {
  const [lang, setLang] = useState("English");
  const [custom, setCustom] = useState("");
  const [input, setInput] = useState(initialInput);

  useEffect(() => {
    if (open) {
      setLang("English");
      setCustom("");
      setInput(initialInput);
    }
  }, [open, initialInput]);

  const targetLang = lang === "custom" ? custom.trim() : lang;
  const canSubmit = targetLang.length > 0 && (!needsInput || input.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-translate">
        <DialogHeader>
          <DialogTitle>Translate</DialogTitle>
          <DialogDescription>Pick the target language</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Language</Label>
            <Select value={lang} onValueChange={setLang}>
              <SelectTrigger data-testid="select-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom…</SelectItem>
              </SelectContent>
            </Select>
            {lang === "custom" && (
              <Input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Type a language"
                data-testid="input-custom-language"
              />
            )}
          </div>
          {needsInput && (
            <div className="space-y-2">
              <Label>Text to translate</Label>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={5}
                data-testid="textarea-translate-input"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit({ targetLang, input: input.trim() })}
            disabled={!canSubmit}
            data-testid="button-translate-submit"
          >
            Translate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Tone picker ---------------- */

const TONES = [
  "formal",
  "casual",
  "short",
  "long",
  "professional",
  "friendly",
];

interface TonePickerDialogProps {
  open: boolean;
  initialInput?: string;
  needsInput: boolean;
  onCancel: () => void;
  onSubmit: (data: { tone: string; input: string }) => void;
}

export function TonePickerDialog({
  open,
  initialInput = "",
  needsInput,
  onCancel,
  onSubmit,
}: TonePickerDialogProps) {
  const [tone, setTone] = useState("professional");
  const [input, setInput] = useState(initialInput);

  useEffect(() => {
    if (open) {
      setTone("professional");
      setInput(initialInput);
    }
  }, [open, initialInput]);

  const canSubmit = !needsInput || input.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-rewrite">
        <DialogHeader>
          <DialogTitle>Rewrite</DialogTitle>
          <DialogDescription>Pick a tone</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tone</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger data-testid="select-tone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsInput && (
            <div className="space-y-2">
              <Label>Text to rewrite</Label>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={5}
                data-testid="textarea-rewrite-input"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit({ tone, input: input.trim() })}
            disabled={!canSubmit}
            data-testid="button-rewrite-submit"
          >
            Rewrite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Email composer ---------------- */

interface EmailFormDialogProps {
  open: boolean;
  onCancel: () => void;
  onSubmit: (data: {
    to: string;
    subject: string;
    intent: string;
    tone: string;
    lang: string;
  }) => void;
}

export function EmailFormDialog({
  open,
  onCancel,
  onSubmit,
}: EmailFormDialogProps) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [intent, setIntent] = useState("");
  const [tone, setTone] = useState("professional");
  const [lang, setLang] = useState("English");

  useEffect(() => {
    if (open) {
      setTo("");
      setSubject("");
      setIntent("");
      setTone("professional");
      setLang("English");
    }
  }, [open]);

  const canSubmit =
    to.trim().length > 0 &&
    subject.trim().length > 0 &&
    intent.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-email">
        <DialogHeader>
          <DialogTitle>Draft Email</DialogTitle>
          <DialogDescription>Fill in the basics, AI writes the rest</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email-to">To</Label>
            <Input
              id="email-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="Recipient name or address"
              data-testid="input-email-to"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              data-testid="input-email-subject"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email-intent">Intent</Label>
            <Textarea
              id="email-intent"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="What should this email accomplish?"
              rows={4}
              data-testid="textarea-email-intent"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tone</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger data-testid="select-email-tone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Language</Label>
              <Select value={lang} onValueChange={setLang}>
                <SelectTrigger data-testid="select-email-lang">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSubmit({
                to: to.trim(),
                subject: subject.trim(),
                intent: intent.trim(),
                tone,
                lang,
              })
            }
            disabled={!canSubmit}
            data-testid="button-email-submit"
          >
            Draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
