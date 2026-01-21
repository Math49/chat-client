/**
 * @fileoverview Index des services
 * Exports centralisés pour toute la couche métier.
 */

export { UserService, userService, type UserProfile, type UserServiceEvents } from "./user.service";
export { ChatService, chatService, type ChatStatus, type ChatServiceEvents } from "./chat.service";
export {
  CallService,
  callService,
  type CallState,
  type CallPhase,
  type CallServiceEvents,
} from "./call.service";
