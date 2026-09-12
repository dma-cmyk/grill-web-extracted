import React, { useEffect, useRef } from 'react';

interface DialogProps {
  onClose: () => void;
  titleId: string;
  descriptionId?: string;
  overlayClassName?: string;
  panelClassName?: string;
  children: React.ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Dialog: React.FC<DialogProps> = ({
  onClose,
  titleId,
  descriptionId,
  overlayClassName,
  panelClassName,
  children,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const focusableElements = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (focusableElements && focusableElements.length > 0) {
      focusableElements[0].focus();
    } else {
      panelRef.current?.focus();
    }

    return () => {
      previouslyFocusedRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key !== 'Tab') {
        return;
      }

      const focusableElements = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);

      if (!focusableElements || focusableElements.length === 0) {
        e.preventDefault();
        return;
      }

      const firstFocusableElement = focusableElements[0];
      const lastFocusableElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey && document.activeElement === firstFocusableElement) {
        e.preventDefault();
        lastFocusableElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastFocusableElement) {
        e.preventDefault();
        firstFocusableElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className={overlayClassName}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={panelClassName}
      >
        {children}
      </div>
    </div>
  );
};
