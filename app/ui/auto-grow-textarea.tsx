"use client";

import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

// A textarea that starts at `rows` tall and grows with its content.
export function AutoGrowTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto"; // let it shrink back to `rows` first
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
  }, [props.value]);

  return <textarea ref={ref} {...props} />;
}
