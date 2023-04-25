package net.mrchar.corn.repository;

import net.mrchar.corn.model.Quota;
import org.springframework.data.repository.CrudRepository;

import java.util.UUID;


public interface QuotaRepository extends CrudRepository<Quota, UUID> {
}
