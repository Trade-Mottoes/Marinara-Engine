import type { ChatCompletionResult, ChatMessage, ChatOptions, LLMUsage } from "../base-provider.js";
import { BaseLLMProvider } from "../base-provider.js";
import { OpenAIProvider } from "./openai.provider.js";
import { sidecarModelService } from "../../sidecar/sidecar-model.service.js";
import { sidecarProcessService } from "../../sidecar/sidecar-process.service.js";
import { resolveSidecarRequestModel } from "../../sidecar/sidecar-request-model.js";

export class LocalSidecarProvider extends BaseLLMProvider {
  constructor() {
    super("", "");
  }

  private async createDelegate(): Promise<OpenAIProvider> {
    const baseUrl = await sidecarProcessService.ensureReady({ forceStart: true });
    const contextSize = sidecarModelService.getConfig().contextSize;
    return new OpenAIProvider(`${baseUrl}/v1`, "local-sidecar", contextSize, null);
  }

  private getRequestModel(): string {
    return resolveSidecarRequestModel(
      sidecarModelService.getResolvedBackend(),
      sidecarModelService.getConfiguredModelRef(),
    );
  }

  private applyRuntimeSettings(options: ChatOptions): ChatOptions {
    const config = sidecarModelService.getConfig();
    const requestedMaxTokens =
      typeof options.maxTokens === "number" && Number.isFinite(options.maxTokens)
        ? Math.max(1, Math.floor(options.maxTokens))
        : undefined;
    // The user's runtime config maxTokens is their preferred ceiling — what
    // they're willing to wait for. A caller's explicit maxTokens (scene-
    // conclude asks for 1024, day/week summary asks for 4096, etc.) is a
    // task-specific floor — the minimum headroom that task needs. Combine
    // with Math.max() so neither side silently demotes the other:
    //   - low user config (64 for snappy chat) doesn't truncate a 1024
    //     scene summary
    //   - high user config (4096+) doesn't get clamped down by a caller's
    //     default 1024
    // The model stops naturally when its prompt instructions are satisfied
    // ("max 200 words" in the scene-summary prompt, for example), so a
    // generous ceiling doesn't waste tokens — it just allows longer output
    // when the task warrants.
    return {
      ...options,
      maxTokens: Math.max(requestedMaxTokens ?? 0, config.maxTokens),
      temperature: config.temperature,
      topP: config.topP,
      topK: config.topK,
    };
  }

  async *chat(messages: ChatMessage[], options: ChatOptions): AsyncGenerator<string, LLMUsage | void, unknown> {
    const delegate = await this.createDelegate();
    return yield* delegate.chat(messages, {
      ...this.applyRuntimeSettings(options),
      model: this.getRequestModel(),
    });
  }

  async chatComplete(messages: ChatMessage[], options: ChatOptions): Promise<ChatCompletionResult> {
    const delegate = await this.createDelegate();
    return delegate.chatComplete(messages, {
      ...this.applyRuntimeSettings(options),
      model: this.getRequestModel(),
    });
  }

  async embed(_texts: string[], _model: string): Promise<number[][]> {
    throw new Error("The local sidecar does not support embeddings.");
  }
}
