import { IsObject, IsOptional } from 'class-validator';

export class TestInputDto {
  @IsOptional() @IsObject() config: Record<string, unknown> = {};
  @IsOptional() shipment: unknown = null;
  @IsOptional() request: unknown = null;
  @IsOptional() @IsObject() context: Record<string, unknown> = {};
  @IsOptional() @IsObject() trigger: { event: string } = { event: 'manual.test' };
}
