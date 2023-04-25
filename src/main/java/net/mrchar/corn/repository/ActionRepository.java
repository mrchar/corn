package net.mrchar.corn.repository;

import net.mrchar.corn.model.Action;
import org.springframework.data.repository.CrudRepository;

import java.util.UUID;


public interface ActionRepository extends CrudRepository<Action, UUID> {
}
