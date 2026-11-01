import {
  Activity,
  Code,
  Compass,
  Cpu,
  FileCheck2,
  Globe,
  Layers,
  Palette,
  Shield,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";

export function AuthShellBackgroundIcons() {
  return (
    <div className="auth-shell-backside-icons" aria-hidden="true">
      <span className="shell-bg-icon shell-icon-1"><Code size={36} /></span>
      <span className="shell-bg-icon shell-icon-2"><Layers size={40} /></span>
      <span className="shell-bg-icon shell-icon-3"><Sparkles size={28} /></span>
      <span className="shell-bg-icon shell-icon-4"><Globe size={38} /></span>
      <span className="shell-bg-icon shell-icon-5"><Cpu size={34} /></span>
      <span className="shell-bg-icon shell-icon-6"><Palette size={34} /></span>
      <span className="shell-bg-icon shell-icon-7"><Compass size={38} /></span>
      <span className="shell-bg-icon shell-icon-8"><Terminal size={32} /></span>
      <span className="shell-bg-icon shell-icon-9"><Zap size={30} /></span>
      <span className="shell-bg-icon shell-icon-10"><Shield size={36} /></span>
      <span className="shell-bg-icon shell-icon-11"><Activity size={32} /></span>
      <span className="shell-bg-icon shell-icon-12"><FileCheck2 size={34} /></span>
    </div>
  );
}
