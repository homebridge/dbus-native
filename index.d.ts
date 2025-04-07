import {EventEmitter} from 'events'
import {Socket} from 'net'

interface DbusInterface extends EventEmitter {
	on(event: string, callback: (error: Error, data: any) => void): void
}

interface DbusService {
	getInterface(path: string, interfaceName: string, callback: (error: Error, interface: DbusInterface) => void): void
}

interface DbusBus {
	getService(serviceName: string): DbusService
}

function systemBus(): DbusBus
function sessionBus(): DbusBus

export {systemBus, sessionBus}
export default {systemBus, sessionBus}

