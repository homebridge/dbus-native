import { EventEmitter } from "events";
import { Socket } from "net";
import { Duplex } from "stream";

export function systemBus(): MessageBus;

export interface ClientOptions {
  busAddress?: string;
  socket?: string;
  host?: string;
  port?: number;
  stream?: Duplex;
  authMethods?: string[];
  direct?: boolean;
}

export function sessionBus(options?: ClientOptions): MessageBus;

export interface InterfaceDescriptor {
  name: string;
  methods?: Record<string, [string, string, string[]?, string[]?]>;
  signals?: Record<string, [string, ...string[]]>;
  properties?: Record<string, string>;
}

export interface ReplyError {
  name: string;
  message: string;
  body?: unknown[];
}

export class MessageBus {
  connection: BusConnection;
  public invoke(message: any, callback: (error: ReplyError | null | undefined, value: any) => void): void;
  public getService(name: string): DBusService;
  public exportInterface(implementation: object, path: string, descriptor: InterfaceDescriptor): void;
  public requestName(name: string, flags: number, callback?: (error: ReplyError | null | undefined, result?: number) => void): void;
}

export class BusConnection extends EventEmitter {
  public stream: Socket;
}

export class DBusService {
  public name: string;
  public bus: MessageBus;
  public getObject(name: string, callback: (error: null | Error, obj?: DBusObject) => void): DBusObject;
  public getInterface(objName: string, ifaceName: string, callback: (error: null | Error, iface?: DBusInterface) => void): void;
}

export class DBusObject {
  public name: string;
  public service: DBusService;
  public as(name: string): DBusInterface;
}

export class DBusInterface extends EventEmitter implements Record<string, any> {
  public $parent: DBusObject;
  public $name: string; // string interface name
}
