import React from "react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";

/**
 * LoadingIcon - Animated Lottie loader component using @lottiefiles/dotlottie-react.
 *
 * Example usage:
 *   <LoadingIcon />
 *   <LoadingIcon src="path/to/animation.lottie" loop autoplay size={100} />
 */
export default function LoadingIcon({
  src = "path/to/animation.lottie",
  loop = true,
  autoplay = true,
  size = 90,
  style,
  className = "",
  ...props
}) {
  return (
    <div
      className={`lottie-loader-container ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: typeof size === "number" ? `${size}px` : size,
        height: typeof size === "number" ? `${size}px` : size,
        overflow: "hidden",
        ...style,
      }}
      aria-label="Loading..."
      role="status"
    >
      <DotLottieReact
        src={src}
        loop={loop}
        autoplay={autoplay}
        style={{ width: "100%", height: "100%" }}
        {...props}
      />
    </div>
  );
}

export { DotLottieReact };

