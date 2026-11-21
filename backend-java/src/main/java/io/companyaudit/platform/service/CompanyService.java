package io.companyaudit.platform.service;

import io.companyaudit.platform.domain.CompanyEntity;
import io.companyaudit.platform.dto.request.CompanyCreateRequest;
import io.companyaudit.platform.dto.request.CompanyProfileUpdate;
import io.companyaudit.platform.dto.response.CompanyProfileOut;
import io.companyaudit.platform.repository.CompanyRepository;
import io.companyaudit.platform.security.UserPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.UUID;

@Service
public class CompanyService {

    private final CompanyRepository companyRepository;

    public CompanyService(CompanyRepository companyRepository) {
        this.companyRepository = companyRepository;
    }

    @Transactional(readOnly = true)
    public CompanyProfileOut getCompanyProfile(UUID companyId) {
        CompanyEntity company = companyRepository.findById(companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company profile not found."));
        return mapToProfileOut(company);
    }

    @Transactional
    public CompanyProfileOut updateCompanyProfile(UUID companyId, CompanyProfileUpdate update, UserPrincipal currentUser) {
        // Enforce company isolation: non-superadmins can only update their own company
        if (!currentUser.getCompanyId().equals(companyId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Cross-company access denied.");
        }

        CompanyEntity company = companyRepository.findById(companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company profile not found."));

        if (update.getLegalName() != null) company.setLegalName(update.getLegalName());
        if (update.getTicker() != null) company.setTicker(update.getTicker());
        if (update.getHeadquarters() != null) company.setHeadquarters(update.getHeadquarters());
        if (update.getFiscalYearLabel() != null) company.setFiscalYearLabel(update.getFiscalYearLabel());
        if (update.getAuditCommitteeChair() != null) company.setAuditCommitteeChair(update.getAuditCommitteeChair());
        if (update.getExternalAuditor() != null) company.setExternalAuditor(update.getExternalAuditor());
        if (update.getRegulatoryScope() != null) company.setRegulatoryScope(new ArrayList<>(update.getRegulatoryScope()));
        if (update.getEnterpriseTargetScore() != null) company.setEnterpriseTargetScore(update.getEnterpriseTargetScore());
        if (update.getMinimumCompositeFloor() != null) company.setMinimumCompositeFloor(update.getMinimumCompositeFloor());
        if (update.getBoardRiskThreshold() != null) company.setBoardRiskThreshold(update.getBoardRiskThreshold());
        if (update.getDigestFrequency() != null) company.setDigestFrequency(update.getDigestFrequency());
        if (update.getSlaAutoEscalate() != null) company.setSlaAutoEscalate(update.getSlaAutoEscalate());
        if (update.getAiCitationStrict() != null) company.setAiCitationStrict(update.getAiCitationStrict());
        if (update.getShaLockEnabled() != null) company.setShaLockEnabled(update.getShaLockEnabled());

        CompanyEntity saved = companyRepository.save(company);
        return mapToProfileOut(saved);
    }

    @Transactional
    public CompanyProfileOut createCompany(CompanyCreateRequest request, UserPrincipal currentUser) {
        // SuperAdmin or authorized administrator only
        if (companyRepository.findByLegalName(request.getLegalName().trim()).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A company with this legal name already exists.");
        }

        CompanyEntity company = new CompanyEntity();
        company.setLegalName(request.getLegalName().trim());
        company.setTicker(request.getTicker());
        company.setHeadquarters(request.getHeadquarters());
        if (request.getFiscalYearLabel() != null) company.setFiscalYearLabel(request.getFiscalYearLabel());
        if (request.getRegulatoryScope() != null) company.setRegulatoryScope(new ArrayList<>(request.getRegulatoryScope()));
        if (request.getEnterpriseTargetScore() != null) company.setEnterpriseTargetScore(request.getEnterpriseTargetScore());
        if (request.getMinimumCompositeFloor() != null) company.setMinimumCompositeFloor(request.getMinimumCompositeFloor());
        if (request.getBoardRiskThreshold() != null) company.setBoardRiskThreshold(request.getBoardRiskThreshold());
        company.setIsActive(true);

        CompanyEntity saved = companyRepository.save(company);
        return mapToProfileOut(saved);
    }

    public CompanyProfileOut mapToProfileOut(CompanyEntity entity) {
        CompanyProfileOut out = new CompanyProfileOut();
        out.setId(entity.getId());
        out.setLegalName(entity.getLegalName());
        out.setTicker(entity.getTicker());
        out.setHeadquarters(entity.getHeadquarters());
        out.setFiscalYearLabel(entity.getFiscalYearLabel());
        out.setAuditCommitteeChair(entity.getAuditCommitteeChair());
        out.setExternalAuditor(entity.getExternalAuditor());
        out.setRegulatoryScope(entity.getRegulatoryScope() != null ? entity.getRegulatoryScope() : new ArrayList<>());
        out.setEnterpriseTargetScore(entity.getEnterpriseTargetScore());
        out.setMinimumCompositeFloor(entity.getMinimumCompositeFloor());
        out.setBoardRiskThreshold(entity.getBoardRiskThreshold());
        out.setDigestFrequency(entity.getDigestFrequency());
        out.setSlaAutoEscalate(entity.getSlaAutoEscalate());
        out.setAiCitationStrict(entity.getAiCitationStrict());
        out.setShaLockEnabled(entity.getShaLockEnabled());
        out.setIsActive(entity.getIsActive());
        out.setCreatedAt(entity.getCreatedAt());
        out.setUpdatedAt(entity.getUpdatedAt());
        return out;
    }
}
