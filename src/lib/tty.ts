let _forceInteractive: boolean | undefined;

export function setForceInteractive(value: boolean | undefined): void {
  _forceInteractive = value;
}

export function isInteractive(): boolean {
  if (_forceInteractive !== undefined) return _forceInteractive;
  return process.stdin.isTTY === true;
}
