import React, { useEffect, useRef } from 'react';

interface ModalDialogProps {
  labelledBy: string;
  onClose: () => void;
  preventClose?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** Checks whether a pointer event landed outside the dialog's border box (on the backdrop). */
function isOutsideDialog(e: React.PointerEvent<HTMLDialogElement>): boolean {
  const rect = e.currentTarget.getBoundingClientRect();
  return (
    e.clientX < rect.left ||
    e.clientX > rect.right ||
    e.clientY < rect.top ||
    e.clientY > rect.bottom
  );
}

/**
 * Shared accessible native `<dialog>` modal wrapper.
 * Coordinates cleanup and `onClose` so React StrictMode's simulated unmount/remount does not
 * let cleanup's queued `close` event dismiss the newly reopened dialog.
 */
export const ModalDialog: React.FC<ModalDialogProps> = ({
  labelledBy,
  onClose,
  preventClose = false,
  className = '',
  children,
}) => {
  const ref = useRef<HTMLDialogElement>(null);
  const isMountedRef = useRef(false);
  const syncClosingRef = useRef(false);
  const pressedOutsideRef = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    isMountedRef.current = true;
    if (!dialog.open) {
      dialog.showModal();
    }
    return () => {
      isMountedRef.current = false;
      if (dialog.open) {
        syncClosingRef.current = true;
        dialog.close();
        syncClosingRef.current = false;
      }
    };
  }, []);

  const handleClose = (e: React.SyntheticEvent<HTMLDialogElement>) => {
    const dialog = e.currentTarget;
    // Ignore stale close events from StrictMode cleanup (dialog was synchronously reopened by
    // setup #2, so dialog.open is true) or from unmounting cleanly.
    if (dialog.open || syncClosingRef.current || !isMountedRef.current) {
      return;
    }
    if (dialog.returnValue) {
      dialog.returnValue = '';
    }
    onClose();
  };

  // Fallback for browsers without <dialog closedby> (e.g. Safari): require both press and release
  // outside the dialog box so dragging text selection onto the backdrop never dismisses.
  const supportsClosedBy =
    typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype;

  const handlePointerDown = (e: React.PointerEvent<HTMLDialogElement>) => {
    if (supportsClosedBy || preventClose) {
      pressedOutsideRef.current = false;
      return;
    }
    pressedOutsideRef.current = isOutsideDialog(e);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDialogElement>) => {
    if (supportsClosedBy || preventClose) return;
    const wasOutside = pressedOutsideRef.current;
    pressedOutsideRef.current = false;
    if (wasOutside && isOutsideDialog(e) && e.currentTarget.open) {
      e.currentTarget.close();
    }
  };

  const closedByProp = {
    closedby: preventClose ? 'none' : 'any',
  } as React.HTMLAttributes<HTMLDialogElement>;

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        if (preventClose) e.preventDefault();
      }}
      onClose={handleClose}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      className={`m-auto max-h-[calc(100dvh-2rem)] overflow-y-auto p-0 bg-surface text-ink border border-line rounded-2xl shadow-2xl backdrop:bg-black/80 backdrop:backdrop-blur-sm ${className}`}
      {...closedByProp}
    >
      {children}
    </dialog>
  );
};
