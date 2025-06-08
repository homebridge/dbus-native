import { EventEmitter } from "events";
import { Socket } from "net";

export function systemBus(): MessageBus;

export class MessageBus {
  connection: BusConnection;
  public invoke(message: any, callback: (error: { name: string, message: any } | undefined, value: any) => void): void;
  public getService(name: string): DBusService;
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
