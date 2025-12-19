import { useContext } from "react";
import { FeedbackCtx } from "./context";

export function useFeedback() {
  const ctx = useContext(FeedbackCtx);
  if (!ctx) {
    return {
      success: () => {},
      error: () => {},
      info: () => {},
      confirm: async () => false,
    };
  }
  return ctx;
}

export function useConfirm() {
  const { confirm } = useFeedback();
  return confirm;
}
