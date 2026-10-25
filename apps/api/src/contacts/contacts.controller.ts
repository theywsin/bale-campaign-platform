import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes, ApiProduces, ApiTags } from "@nestjs/swagger";
import { memoryStorage } from "multer";
import { z } from "zod";
import {
  contactListQuerySchema,
  createContactListSchema,
  createContactSchema,
  createSuppressionSchema,
  CSV_IMPORT_MAX_BYTES,
  listMembershipSchema,
  paginationQuerySchema,
  updateContactSchema,
} from "@bcp/shared";
import { CurrentOrg, CurrentUser, RequireOrgPermission } from "../common/decorators/auth.decorators";
import { ApiPaginationQuery, ApiZodBody, ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AppException } from "../common/errors";
import { AppRequest, AuthUser, clientInfo, OrgContext } from "../common/request-context";
import { ContactsService } from "./contacts.service";

const uuid = new ParseUUIDPipe();
const optionalListQuery = z.object({ listId: z.uuid().optional() });
const archiveSchema = z.object({ archived: z.boolean() });

@ApiTags("contacts")
@Controller({ path: "organizations/:orgId", version: "1" })
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get("contacts")
  @RequireOrgPermission("contacts:read")
  @ApiPaginationQuery()
  list(@CurrentOrg() ctx: OrgContext, @Query(new ZodValidationPipe(contactListQuerySchema)) q: z.infer<typeof contactListQuerySchema>) {
    return this.contacts.list(ctx, q);
  }

  @Post("contacts")
  @RequireOrgPermission("contacts:write")
  @ApiZodBody(createContactSchema)
  create(
    @CurrentOrg() ctx: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createContactSchema)) body: z.infer<typeof createContactSchema>,
    @Req() req: AppRequest,
  ) {
    return this.contacts.create(ctx, user, body, clientInfo(req));
  }

  @Get("contacts/export")
  @RequireOrgPermission("contacts:export")
  @ApiProduces("text/csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="contacts.csv"')
  @Header("Cache-Control", "no-store")
  export(
    @CurrentOrg() ctx: OrgContext,
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(optionalListQuery)) q: z.infer<typeof optionalListQuery>,
    @Req() req: AppRequest,
  ) {
    return this.contacts.exportCsv(ctx, user, q.listId, clientInfo(req));
  }

  @Get("contacts/imports")
  @RequireOrgPermission("contacts:read")
  imports(@CurrentOrg() ctx: OrgContext) {
    return this.contacts.listImports(ctx);
  }

  @Post("contacts/import")
  @RequireOrgPermission("contacts:write")
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: { type: "object", properties: { file: { type: "string", format: "binary" }, listId: { type: "string" } } } })
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: CSV_IMPORT_MAX_BYTES, files: 1, fields: 5 } }))
  async import(
    @CurrentOrg() ctx: OrgContext,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe(optionalListQuery)) body: z.infer<typeof optionalListQuery>,
    @Req() req: AppRequest,
  ) {
    if (!file) throw AppException.validation("فایل CSV را انتخاب کنید.");
    if (!/\.(csv|txt)$/i.test(file.originalname)) throw AppException.validation("فقط فایل با پسوند ‎.csv پذیرفته می‌شود.");
    return this.contacts.importCsv(ctx, user, file, body.listId, clientInfo(req));
  }

  @Get("contacts/:contactId")
  @RequireOrgPermission("contacts:read")
  get(@CurrentOrg() ctx: OrgContext, @Param("contactId", uuid) id: string) {
    return this.contacts.get(ctx, id);
  }

  @Patch("contacts/:contactId")
  @RequireOrgPermission("contacts:write")
  @ApiZodBody(updateContactSchema)
  update(
    @CurrentOrg() ctx: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param("contactId", uuid) id: string,
    @Body(new ZodValidationPipe(updateContactSchema)) body: z.infer<typeof updateContactSchema>,
    @Req() req: AppRequest,
  ) {
    return this.contacts.update(ctx, user, id, body, clientInfo(req));
  }

  @Put("contacts/:contactId/archived")
  @RequireOrgPermission("contacts:write")
  @ApiZodBody(archiveSchema)
  archive(
    @CurrentOrg() ctx: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param("contactId", uuid) id: string,
    @Body(new ZodValidationPipe(archiveSchema)) body: z.infer<typeof archiveSchema>,
    @Req() req: AppRequest,
  ) {
    return this.contacts.setArchived(ctx, user, id, body.archived, clientInfo(req));
  }

  @Delete("contacts/:contactId")
  @RequireOrgPermission("contacts:write")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentOrg() ctx: OrgContext, @CurrentUser() user: AuthUser, @Param("contactId", uuid) id: string, @Req() req: AppRequest) {
    await this.contacts.remove(ctx, user, id, clientInfo(req));
  }

  // ---- lists ----

  @Get("lists")
  @RequireOrgPermission("contacts:read")
  lists(@CurrentOrg() ctx: OrgContext) {
    return this.contacts.lists(ctx);
  }

  @Post("lists")
  @RequireOrgPermission("contacts:write")
  @ApiZodBody(createContactListSchema)
  createList(
    @CurrentOrg() ctx: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createContactListSchema)) body: z.infer<typeof createContactListSchema>,
    @Req() req: AppRequest,
  ) {
    return this.contacts.createList(ctx, user, body, clientInfo(req));
  }

  @Patch("lists/:listId")
  @RequireOrgPermission("contacts:write")
  @ApiZodBody(createContactListSchema)
  updateList(
    @CurrentOrg() ctx: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param("listId", uuid) id: string,
    @Body(new ZodValidationPipe(createContactListSchema)) body: z.infer<typeof createContactListSchema>,
    @Req() req: AppRequest,
  ) {
    return this.contacts.updateList(ctx, user, id, body, clientInfo(req));
  }

  @Delete("lists/:listId")
  @RequireOrgPermission("contacts:write")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteList(@CurrentOrg() ctx: OrgContext, @CurrentUser() user: AuthUser, @Param("listId", uuid) id: string, @Req() req: AppRequest) {
    await this.contacts.deleteList(ctx, user, id, clientInfo(req));
  }

  @Post("lists/:listId/members")
  @RequireOrgPermission("contacts:write")
  @ApiZodBody(listMembershipSchema)
  addMembers(
    @CurrentOrg() ctx: OrgContext,
    @Param("listId", uuid) id: string,
    @Body(new ZodValidationPipe(listMembershipSchema)) body: z.infer<typeof listMembershipSchema>,
  ) {
    return this.contacts.addToList(ctx, id, body.contactIds);
  }

  @Post("lists/:listId/members/remove")
  @RequireOrgPermission("contacts:write")
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(listMembershipSchema)
  removeMembers(
    @CurrentOrg() ctx: OrgContext,
    @Param("listId", uuid) id: string,
    @Body(new ZodValidationPipe(listMembershipSchema)) body: z.infer<typeof listMembershipSchema>,
  ) {
    return this.contacts.removeFromList(ctx, id, body.contactIds);
  }

  // ---- suppression ----

  @Get("suppressions")
  @RequireOrgPermission("contacts:read")
  @ApiPaginationQuery()
  suppressions(@CurrentOrg() ctx: OrgContext, @Query(new ZodValidationPipe(paginationQuerySchema)) q: z.infer<typeof paginationQuerySchema>) {
    return this.contacts.suppressions(ctx, q);
  }

  @Post("suppressions")
  @RequireOrgPermission("contacts:write")
  @ApiZodBody(createSuppressionSchema)
  addSuppression(
    @CurrentOrg() ctx: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createSuppressionSchema)) body: z.infer<typeof createSuppressionSchema>,
    @Req() req: AppRequest,
  ) {
    return this.contacts.addSuppression(ctx, user, body, clientInfo(req));
  }

  @Delete("suppressions/:suppressionId")
  @RequireOrgPermission("contacts:write")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeSuppression(@CurrentOrg() ctx: OrgContext, @CurrentUser() user: AuthUser, @Param("suppressionId", uuid) id: string, @Req() req: AppRequest) {
    await this.contacts.removeSuppression(ctx, user, id, clientInfo(req));
  }
}
