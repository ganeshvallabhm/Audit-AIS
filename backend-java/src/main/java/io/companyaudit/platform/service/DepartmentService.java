package io.companyaudit.platform.service;

import io.companyaudit.platform.domain.DepartmentEntity;
import io.companyaudit.platform.domain.UserEntity;
import io.companyaudit.platform.dto.request.DepartmentCreate;
import io.companyaudit.platform.dto.request.DepartmentUpdate;
import io.companyaudit.platform.dto.response.DepartmentOut;
import io.companyaudit.platform.dto.response.MessageResponse;
import io.companyaudit.platform.repository.DepartmentRepository;
import io.companyaudit.platform.repository.UserRepository;
import io.companyaudit.platform.security.UserPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class DepartmentService {

    private final DepartmentRepository departmentRepository;
    private final UserRepository userRepository;

    public DepartmentService(DepartmentRepository departmentRepository, UserRepository userRepository) {
        this.departmentRepository = departmentRepository;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public List<DepartmentOut> listDepartments(UUID companyId) {
        List<DepartmentEntity> depts = departmentRepository.findAllByCompanyId(companyId);
        return serializeDepartments(companyId, depts);
    }

    @Transactional(readOnly = true)
    public DepartmentOut getDepartment(UUID companyId, UUID departmentId) {
        DepartmentEntity dept = departmentRepository.findById(departmentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Department not found."));

        if (!dept.getCompanyId().equals(companyId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Department not found in your organization.");
        }

        return serializeDepartments(companyId, Collections.singletonList(dept)).get(0);
    }

    @Transactional
    public DepartmentOut createDepartment(UUID companyId, DepartmentCreate request, UserPrincipal currentUser) {
        String normalizedCode = request.getCode().trim().toUpperCase();

        if (departmentRepository.findByCompanyIdAndCode(companyId, normalizedCode).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Department code '" + request.getCode() + "' already exists.");
        }

        if (request.getHeadUserId() != null) {
            UserEntity head = userRepository.findById(request.getHeadUserId()).orElse(null);
            if (head == null || !head.getCompanyId().equals(companyId)) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Head user not found in your organization.");
            }
        }

        DepartmentEntity dept = new DepartmentEntity();
        dept.setCompanyId(companyId);
        dept.setCode(normalizedCode);
        dept.setName(request.getName().trim());
        dept.setHeadUserId(request.getHeadUserId());
        if (request.getTargetScore() != null) dept.setTargetScore(request.getTargetScore());
        if (request.getScoringWeight() != null) dept.setScoringWeight(request.getScoringWeight());
        dept.setAttentionNote(request.getAttentionNote());

        DepartmentEntity saved = departmentRepository.save(dept);
        return serializeDepartments(companyId, Collections.singletonList(saved)).get(0);
    }

    @Transactional
    public DepartmentOut updateDepartment(UUID companyId, UUID departmentId, DepartmentUpdate request, UserPrincipal currentUser) {
        DepartmentEntity dept = departmentRepository.findById(departmentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Department not found."));

        if (!dept.getCompanyId().equals(companyId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Department not found in your organization.");
        }

        if (request.getHeadUserId() != null) {
            UserEntity head = userRepository.findById(request.getHeadUserId()).orElse(null);
            if (head == null || !head.getCompanyId().equals(companyId)) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Head user not found in your organization.");
            }
            dept.setHeadUserId(request.getHeadUserId());
        }

        if (request.getName() != null) dept.setName(request.getName().trim());
        if (request.getTargetScore() != null) dept.setTargetScore(request.getTargetScore());
        if (request.getScoringWeight() != null) dept.setScoringWeight(request.getScoringWeight());
        if (request.getAttentionNote() != null) dept.setAttentionNote(request.getAttentionNote());

        DepartmentEntity saved = departmentRepository.save(dept);
        return serializeDepartments(companyId, Collections.singletonList(saved)).get(0);
    }

    @Transactional
    public MessageResponse deleteDepartment(UUID companyId, UUID departmentId, UserPrincipal currentUser) {
        DepartmentEntity dept = departmentRepository.findById(departmentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Department not found."));

        if (!dept.getCompanyId().equals(companyId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Department not found in your organization.");
        }

        // Check if users are assigned to department
        List<UserEntity> members = userRepository.findAllByCompanyIdAndDepartmentId(companyId, departmentId);
        if (!members.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Cannot delete department '" + dept.getCode() + "' because " + members.size() + " user(s) reference it.");
        }

        String deptCode = dept.getCode();
        departmentRepository.delete(dept);
        return new MessageResponse("Department '" + deptCode + "' deleted successfully.");
    }

    private List<DepartmentOut> serializeDepartments(UUID companyId, List<DepartmentEntity> depts) {
        if (depts == null || depts.isEmpty()) return Collections.emptyList();

        Set<UUID> headUserIds = depts.stream()
                .map(DepartmentEntity::getHeadUserId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        Map<UUID, String> headNames = new HashMap<>();
        if (!headUserIds.isEmpty()) {
            userRepository.findAllById(headUserIds)
                    .forEach(u -> headNames.put(u.getId(), u.getFullName()));
        }

        List<DepartmentOut> result = new ArrayList<>();
        for (DepartmentEntity d : depts) {
            DepartmentOut out = new DepartmentOut();
            out.setId(d.getId());
            out.setCompanyId(d.getCompanyId());
            out.setHeadUserId(d.getHeadUserId());
            out.setHeadName(d.getHeadUserId() != null ? headNames.get(d.getHeadUserId()) : null);
            out.setCode(d.getCode());
            out.setName(d.getName());
            out.setTargetScore(d.getTargetScore());
            out.setScoringWeight(d.getScoringWeight());
            out.setAttentionNote(d.getAttentionNote());
            out.setCreatedAt(d.getCreatedAt());
            out.setUpdatedAt(d.getUpdatedAt());
            result.add(out);
        }
        return result;
    }
}
