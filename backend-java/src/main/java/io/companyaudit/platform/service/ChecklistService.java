package io.companyaudit.platform.service;

import io.companyaudit.platform.domain.ChecklistEntity;
import io.companyaudit.platform.domain.ChecklistItemEntity;
import io.companyaudit.platform.dto.request.ChecklistCreate;
import io.companyaudit.platform.dto.request.ChecklistItemCreate;
import io.companyaudit.platform.dto.request.ChecklistItemUpdate;
import io.companyaudit.platform.dto.response.ChecklistItemOut;
import io.companyaudit.platform.dto.response.ChecklistOut;
import io.companyaudit.platform.repository.ChecklistItemRepository;
import io.companyaudit.platform.repository.ChecklistRepository;
import io.companyaudit.platform.security.UserPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class ChecklistService {

    private final ChecklistRepository checklistRepository;
    private final ChecklistItemRepository checklistItemRepository;

    public ChecklistService(ChecklistRepository checklistRepository, ChecklistItemRepository checklistItemRepository) {
        this.checklistRepository = checklistRepository;
        this.checklistItemRepository = checklistItemRepository;
    }

    @Transactional(readOnly = true)
    public List<ChecklistOut> listChecklists(UUID companyId, String domain) {
        List<ChecklistEntity> checklists;
        if (domain != null && !domain.isBlank() && !"All".equalsIgnoreCase(domain)) {
            checklists = checklistRepository.findAllByCompanyIdAndDomainAndIsActiveTrueOrderByCodeAsc(companyId, domain.trim());
        } else {
            checklists = checklistRepository.findAllByCompanyIdAndIsActiveTrueOrderByDomainAscCodeAsc(companyId);
        }
        return checklists.stream().map(this::mapToChecklistOut).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public ChecklistOut getChecklist(UUID companyId, UUID checklistId) {
        ChecklistEntity checklist = checklistRepository.findByCompanyIdAndId(companyId, checklistId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Checklist not found in your organization."));
        return mapToChecklistOut(checklist);
    }

    @Transactional
    public ChecklistOut createChecklist(UUID companyId, ChecklistCreate request, UserPrincipal currentUser) {
        String code = request.getCode();
        if (code == null || code.isBlank()) {
            String domainPrefix = request.getDomain().length() >= 4 ? request.getDomain().substring(0, 4).toUpperCase() : request.getDomain().toUpperCase();
            code = "CHK-" + domainPrefix + "-" + (System.currentTimeMillis() % 10000);
        } else {
            code = code.trim().toUpperCase();
        }

        if (checklistRepository.findByCompanyIdAndCode(companyId, code).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Checklist code '" + code + "' already exists.");
        }

        ChecklistEntity checklist = new ChecklistEntity();
        checklist.setCompanyId(companyId);
        checklist.setCode(code);
        checklist.setTitle(request.getTitle().trim());
        checklist.setDomain(request.getDomain());
        checklist.setFramework(request.getFramework().trim());
        checklist.setVersion(request.getVersion() != null ? request.getVersion().trim() : "1.0");
        checklist.setIsActive(true);

        ChecklistEntity saved = checklistRepository.save(checklist);
        return mapToChecklistOut(saved);
    }

    @Transactional
    public ChecklistItemOut createChecklistItem(UUID companyId, UUID checklistId, ChecklistItemCreate request, UserPrincipal currentUser) {
        ChecklistEntity checklist = checklistRepository.findByCompanyIdAndId(companyId, checklistId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Checklist not found in your organization."));

        String controlCode = request.getControlCode().trim().toUpperCase();
        if (checklistItemRepository.findByChecklistIdAndControlCode(checklist.getId(), controlCode).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Control code '" + controlCode + "' already exists in checklist " + checklist.getCode() + ".");
        }

        ChecklistItemEntity item = new ChecklistItemEntity();
        item.setCompanyId(companyId);
        item.setChecklistId(checklist.getId());
        item.setControlCode(controlCode);
        item.setTitle(request.getTitle().trim());
        item.setTestProcedure(request.getTestProcedure().trim());
        if (request.getWeight() != null) item.setWeight(request.getWeight());
        item.setDisplayOrder(request.getDisplayOrder());

        ChecklistItemEntity saved = checklistItemRepository.save(item);
        return mapToItemOut(saved, checklist);
    }

    @Transactional
    public ChecklistItemOut updateChecklistItem(UUID companyId, UUID itemId, ChecklistItemUpdate request, UserPrincipal currentUser) {
        ChecklistItemEntity item = checklistItemRepository.findByCompanyIdAndId(companyId, itemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Checklist item not found in your organization."));

        ChecklistEntity checklist = checklistRepository.findById(item.getChecklistId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Parent checklist not found."));

        if (request.getTitle() != null) item.setTitle(request.getTitle().trim());
        if (request.getTestProcedure() != null) item.setTestProcedure(request.getTestProcedure().trim());
        if (request.getWeight() != null) item.setWeight(request.getWeight());
        if (request.getDisplayOrder() != null) item.setDisplayOrder(request.getDisplayOrder());

        ChecklistItemEntity saved = checklistItemRepository.save(item);
        return mapToItemOut(saved, checklist);
    }

    public ChecklistOut mapToChecklistOut(ChecklistEntity entity) {
        ChecklistOut out = new ChecklistOut();
        out.setId(entity.getId());
        out.setCompanyId(entity.getCompanyId());
        out.setCode(entity.getCode());
        out.setTitle(entity.getTitle());
        out.setDomain(entity.getDomain());
        out.setFramework(entity.getFramework());
        out.setVersion(entity.getVersion());
        out.setIsActive(entity.getIsActive());

        List<ChecklistItemOut> itemsOut = new ArrayList<>();
        if (entity.getItems() != null) {
            for (ChecklistItemEntity item : entity.getItems()) {
                itemsOut.add(mapToItemOut(item, entity));
            }
        }
        out.setItems(itemsOut);
        return out;
    }

    public ChecklistItemOut mapToItemOut(ChecklistItemEntity item, ChecklistEntity checklist) {
        ChecklistItemOut out = new ChecklistItemOut();
        out.setId(item.getId());
        out.setChecklistId(item.getChecklistId());
        out.setChecklistCode(checklist != null ? checklist.getCode() : "");
        out.setFramework(checklist != null ? checklist.getFramework() : "");
        out.setDomain(checklist != null ? checklist.getDomain() : "");
        out.setControlCode(item.getControlCode());
        out.setTitle(item.getTitle());
        out.setTestProcedure(item.getTestProcedure());
        out.setWeight(item.getWeight());
        out.setDisplayOrder(item.getDisplayOrder());
        out.setEvidenceCount(0);
        return out;
    }
}
