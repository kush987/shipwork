import { Global, Module } from '@nestjs/common';
import { OutboundHttp } from './outbound-http';

@Global()
@Module({ providers: [OutboundHttp], exports: [OutboundHttp] })
export class OutboundHttpModule {}
