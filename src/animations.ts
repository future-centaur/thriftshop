// Centralized Framer Motion animation system
import type { Variants, Transition } from "framer-motion";

// ============================================================
// Spring Configs
// ============================================================
export const bouncySpring: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 25,
  mass: 0.8,
};

export const smoothSpring: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 30,
};

export const snappySpring: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 35,
};

export const gentleSpring: Transition = {
  type: "spring",
  stiffness: 200,
  damping: 25,
  mass: 1,
};

// ============================================================
// Tab order (for directional page transitions)
// ============================================================
export const TAB_ORDER = [
  "home",
  "receive",
  "stock",
  "sell",
  "review",
  "settings",
] as const;

export const tabDirection = (
  from: string,
  to: string
): number => {
  const a = TAB_ORDER.indexOf(from as never);
  const b = TAB_ORDER.indexOf(to as never);
  if (a === -1 || b === -1) return 1;
  return b > a ? 1 : -1;
};

// ============================================================
// Page Transitions (direction-aware)
// ============================================================
export const pageVariants = (dir: number): Variants => ({
  initial: (d: number) => ({
    x: 50 * d,
    opacity: 0,
  }),
  enter: {
    x: 0,
    opacity: 1,
    transition: { ...smoothSpring, duration: 0.4 },
  },
  exit: (d: number) => ({
    x: -30 * d,
    opacity: 0,
    transition: { duration: 0.25, ease: "easeIn" },
  }),
});

// ============================================================
// Modal / Dialog Animations
// ============================================================
export const backdropVariants: Variants = {
  initial: { opacity: 0, backdropFilter: "blur(0px)" },
  enter: {
    opacity: 1,
    backdropFilter: "blur(10px)",
    transition: { duration: 0.3 },
  },
  exit: {
    opacity: 0,
    backdropFilter: "blur(0px)",
    transition: { duration: 0.2 },
  },
};

export const modalVariants: Variants = {
  initial: { scale: 0.9, opacity: 0, y: 20 },
  enter: {
    scale: 1,
    opacity: 1,
    y: 0,
    transition: bouncySpring,
  },
  exit: {
    scale: 0.95,
    opacity: 0,
    y: 10,
    transition: { duration: 0.2, ease: "easeIn" },
  },
};

// ============================================================
// Toast Animations
// ============================================================
export const toastVariants: Variants = {
  initial: { y: 100, opacity: 0, scale: 0.9 },
  enter: {
    y: 0,
    opacity: 1,
    scale: 1,
    transition: bouncySpring,
  },
  exit: {
    x: 400,
    opacity: 0,
    transition: { duration: 0.25, ease: "easeIn" },
  },
};

// ============================================================
// Stagger Containers
// ============================================================
export const staggerContainer = (
  staggerChildren = 0.05,
  delayChildren = 0.1
): Variants => ({
  initial: {},
  enter: {
    transition: {
      staggerChildren,
      delayChildren,
    },
  },
  exit: {},
});

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 20 },
  enter: {
    opacity: 1,
    y: 0,
    transition: smoothSpring,
  },
  exit: { opacity: 0, y: -10, transition: { duration: 0.15 } },
};

export const flowCardStagger: Variants = {
  initial: {},
  enter: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.2,
    },
  },
};

export const flowCardItem: Variants = {
  initial: { opacity: 0, y: 30, scale: 0.95 },
  enter: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: bouncySpring,
  },
};

// ============================================================
// Sidebar / Nav Animations
// ============================================================
export const navItemVariants: Variants = {
  initial: { x: -10, opacity: 0 },
  enter: (i: number) => ({
    x: 0,
    opacity: 1,
    transition: { ...smoothSpring, delay: i * 0.04 },
  }),
};

export const activeIndicatorVariants: Variants = {
  initial: { opacity: 0, scale: 0.8 },
  enter: {
    opacity: 1,
    scale: 1,
    transition: snappySpring,
  },
  exit: { opacity: 0, scale: 0.8, transition: { duration: 0.15 } },
};

// ============================================================
// Cart Item Animations
// ============================================================
export const cartItemVariants: Variants = {
  initial: { x: 100, opacity: 0, height: 0 },
  enter: {
    x: 0,
    opacity: 1,
    height: "auto",
    transition: bouncySpring,
  },
  exit: {
    x: 100,
    opacity: 0,
    height: 0,
    transition: { duration: 0.2, ease: "easeIn" },
  },
};

// ============================================================
// Counter Animation Helper
// ============================================================
export const counterTransition: Transition = {
  duration: 1.2,
  ease: [0.16, 1, 0.3, 1], // ease-out-expo feel
};

// ============================================================
// Loading Animation
// ============================================================
export const loadingPulse: Variants = {
  initial: { scale: 0.8, opacity: 0 },
  enter: {
    scale: [0.8, 1.1, 1],
    opacity: 1,
    transition: {
      duration: 0.8,
      ease: "easeOut",
    },
  },
};

export const loadingTextStagger: Variants = {
  initial: {},
  enter: {
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.3,
    },
  },
};

export const loadingTextItem: Variants = {
  initial: { opacity: 0, y: 10 },
  enter: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

// ============================================================
// Hover / Tap Presets (for whileHover / whileTap)
// ============================================================
export const hoverLift = {
  y: -4,
  scale: 1.02,
  transition: smoothSpring,
};

export const tapPress = {
  scale: 0.97,
  transition: { duration: 0.1 },
};

export const hoverGlow = {
  scale: 1.05,
  transition: smoothSpring,
};

// ============================================================
// Float Animation (for welcome/decorative elements)
// ============================================================
export const floatAnimation = {
  y: [0, -8, 0],
  transition: {
    duration: 3,
    repeat: Infinity,
    ease: "easeInOut" as const,
  },
};
