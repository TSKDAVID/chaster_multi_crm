export const widgetStyles = `
:host {
  all: initial;
}

.chaster-widget-shell {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: min(380px, calc(100vw - 24px));
  max-height: calc(100vh - 30px);
  font-family: Inter, system-ui, -apple-system, Segoe UI, sans-serif;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 18px;
  background: linear-gradient(165deg, #1f2937, #111827 70%);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35);
  color: #f8fafc;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transform-origin: bottom right;
  animation: chaster-open 220ms ease-out;
}

.chaster-widget-shell.minimized {
  width: 140px;
  border: none;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.3);
  background: #111827;
  animation: chaster-close 180ms ease-in;
}

@keyframes chaster-open {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes chaster-close {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0.85;
    transform: translateY(8px) scale(0.96);
  }
}

.chaster-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 14px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.chaster-header strong {
  font-size: 16px;
  letter-spacing: 0.2px;
}

.chaster-status {
  font-size: 12px;
  color: rgba(248, 250, 252, 0.75);
  margin-top: 3px;
}

.chaster-messages {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  overflow-y: auto;
  min-height: 280px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.01));
}

.bubble {
  padding: 10px 12px;
  border-radius: 14px;
  max-width: 85%;
  font-size: 14px;
  line-height: 1.5;
  animation: chaster-open 140ms ease-out;
}

.bubble.visitor {
  align-self: flex-end;
  background: #4f46e5;
  color: #ffffff;
  border-bottom-right-radius: 6px;
}

.bubble.ai,
.bubble.system {
  align-self: flex-start;
  background: rgba(255, 255, 255, 0.08);
  color: #f3f4f6;
  border-bottom-left-radius: 6px;
}

.bubble.human {
  align-self: flex-start;
  background: rgba(250, 204, 21, 0.2);
  border: 1px solid rgba(250, 204, 21, 0.5);
  color: #fef9c3;
  border-bottom-left-radius: 6px;
}

.chaster-intake {
  padding: 16px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chaster-intake h3 {
  margin: 0;
  font-size: 16px;
}

.chaster-intake p {
  margin: 0 0 4px;
  font-size: 12px;
  color: rgba(248, 250, 252, 0.75);
}

.chaster-intake input {
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 10px;
  padding: 9px 10px;
  background: rgba(17, 24, 39, 0.95);
  color: #f8fafc;
}

.chaster-intake button {
  border: none;
  border-radius: 10px;
  padding: 10px 12px;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: white;
  font-weight: 600;
  cursor: pointer;
}

.composer {
  display: flex;
  gap: 9px;
  padding: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.composer input {
  flex: 1;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 999px;
  padding: 9px 12px;
  background: rgba(17, 24, 39, 0.95);
  color: #f8fafc;
}

.composer button,
.chaster-toggle {
  border: none;
  border-radius: 999px;
  padding: 8px 12px;
  background: rgba(79, 70, 229, 0.95);
  color: white;
  cursor: pointer;
  font-weight: 600;
}

.attach-btn {
  background: rgba(255, 255, 255, 0.16) !important;
}

.hidden-file-input {
  display: none;
}

.attachment-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 12px 12px;
}

.attachment-chip {
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

.chaster-toggle {
  background: rgba(255, 255, 255, 0.14);
}

@media (max-width: 640px) {
  .chaster-widget-shell {
    right: 8px;
    left: 8px;
    width: auto;
    bottom: 8px;
    max-height: calc(100vh - 16px);
  }
}
`;
