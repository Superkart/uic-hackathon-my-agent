import { useId } from "react";

interface PillIconProps {
  className?: string;
  rotate?: boolean;
}

// Oxblood pill — left side bleeds dark red, right side bone-white,
// with a faint gloss strip across the top half.
export default function PillIcon({
  className = "w-8 h-4",
  rotate = false
}: PillIconProps) {
  const id = useId();
  const leftId = `${id}-left`;
  const rightId = `${id}-right`;
  const glossId = `${id}-gloss`;

  return (
    <svg
      width="200"
      height="100"
      viewBox="20 10 160 80"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={rotate ? { transform: "rotate(-45deg)" } : undefined}
      role="img"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={leftId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#7a1818" />
          <stop offset="50%" stopColor="#5C0E0E" />
          <stop offset="100%" stopColor="#3A0808" />
        </linearGradient>
        <linearGradient id={rightId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f5efe0" />
          <stop offset="50%" stopColor="#ede6d3" />
          <stop offset="100%" stopColor="#d6c9a8" />
        </linearGradient>
        <linearGradient id={glossId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="white" stopOpacity="0.45" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M50,20 H100 V80 H50 A30,30 0 0,1 50,20"
        fill={`url(#${leftId})`}
      />
      <path
        d="M100,20 H150 A30,30 0 0,1 150,80 H100 V20"
        fill={`url(#${rightId})`}
      />
      <rect
        x="50"
        y="25"
        width="100"
        height="14"
        rx="7"
        fill={`url(#${glossId})`}
      />
      <line
        x1="100"
        y1="20"
        x2="100"
        y2="80"
        stroke="rgba(0,0,0,0.18)"
        strokeWidth="1.5"
      />
      <path
        d="M50,20 H150 A30,30 0 0,1 150,80 H50 A30,30 0 0,1 50,20"
        fill="none"
        stroke="rgba(0,0,0,0.15)"
        strokeWidth="1.5"
      />
    </svg>
  );
}
