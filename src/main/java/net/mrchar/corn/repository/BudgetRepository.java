package net.mrchar.corn.repository;

import net.mrchar.corn.model.Budget;
import org.springframework.data.repository.CrudRepository;

import java.util.UUID;


public interface BudgetRepository extends CrudRepository<Budget, UUID> {
}
