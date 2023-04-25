package net.mrchar.corn.repository;

import net.mrchar.corn.model.Space;
import org.springframework.data.repository.CrudRepository;

import java.util.UUID;


public interface SpaceRepository extends CrudRepository<Space, UUID> {
}
